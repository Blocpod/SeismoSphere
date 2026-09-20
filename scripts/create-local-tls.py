"""Create this application's private LAN certificate chain. Never install OS trust."""
import datetime as dt
import ipaddress
import json
import pathlib
import sys
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

request = json.load(sys.stdin)
target = pathlib.Path(request['directory']).resolve()
target.mkdir(parents=True, exist_ok=True)
address = ipaddress.ip_address(request['host'])
if address.version != 4 or not (address.is_private or address.is_loopback):
    raise ValueError('A private IPv4 LAN address is required')
machine = request.get('machine', 'SeismoSphere')
now = dt.datetime.now(dt.timezone.utc)
def name(value):
    return x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, value)])
def base(subject, issuer, public, days):
    return (x509.CertificateBuilder().subject_name(subject).issuer_name(issuer)
            .public_key(public).serial_number(x509.random_serial_number())
            .not_valid_before(now-dt.timedelta(minutes=5)).not_valid_after(now+dt.timedelta(days=days)))
def key_bytes(key):
    return key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
def cert_bytes(cert):
    return cert.public_bytes(serialization.Encoding.PEM)

intermediate_file = target/'issuer.pem'
if intermediate_file.exists():
    issuer = x509.load_pem_x509_certificate(intermediate_file.read_bytes())
    issuer_key = serialization.load_pem_private_key((target/'issuer-key.pem').read_bytes(), password=None)
    root = x509.load_pem_x509_certificate((target/'root.pem').read_bytes())
    if issuer.not_valid_after_utc < now+dt.timedelta(days=100):
        raise ValueError('The local issuer expires soon. Rotate the phone trust certificate before renewing access.')
else:
    root_key = ec.generate_private_key(ec.SECP256R1())
    root_name = name('SeismoSphere on '+machine+' — Local Trust')
    root = (base(root_name, root_name, root_key.public_key(), 1825)
            .add_extension(x509.BasicConstraints(ca=True, path_length=1), critical=True)
            .add_extension(x509.KeyUsage(False, False, False, False, False, True, True, None, None), critical=True)
            .add_extension(x509.SubjectKeyIdentifier.from_public_key(root_key.public_key()), critical=False)
            .sign(root_key, hashes.SHA256()))
    issuer_key = ec.generate_private_key(ec.SECP256R1())
    allowed = [x509.IPAddress(ipaddress.ip_network(n)) for n in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','127.0.0.1/32')]
    allowed += [x509.DNSName('localhost'), x509.DNSName('seismosphere.local')]
    issuer = (base(name('SeismoSphere Private LAN Issuer'), root.subject, issuer_key.public_key(), 1095)
              .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
              .add_extension(x509.KeyUsage(False, False, False, False, False, True, True, None, None), critical=True)
              .add_extension(x509.NameConstraints(allowed, None), critical=True)
              .add_extension(x509.SubjectKeyIdentifier.from_public_key(issuer_key.public_key()), critical=False)
              .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(root_key.public_key()), critical=False)
              .sign(root_key, hashes.SHA256()))
    (target/'root.pem').write_bytes(cert_bytes(root))
    (target/'root.cer').write_bytes(root.public_bytes(serialization.Encoding.DER))
    intermediate_file.write_bytes(cert_bytes(issuer))
    (target/'issuer-key.pem').write_bytes(key_bytes(issuer_key))
    # The unrestricted root signing key is deliberately never written to disk.
    del root_key

server_key = ec.generate_private_key(ec.SECP256R1())
san = x509.SubjectAlternativeName([x509.IPAddress(address),x509.IPAddress(ipaddress.ip_address('127.0.0.1')),x509.DNSName('localhost'),x509.DNSName('seismosphere.local')])
leaf = (base(name('SeismoSphere private workspace'), issuer.subject, server_key.public_key(), 90)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.KeyUsage(True, False, False, False, False, False, False, None, None), critical=True)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
        .add_extension(san, critical=False)
        .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(issuer_key.public_key()), critical=False)
        .sign(issuer_key, hashes.SHA256()))
(target/'server-key.pem').write_bytes(key_bytes(server_key))
(target/'server-chain.pem').write_bytes(cert_bytes(leaf)+cert_bytes(issuer))
metadata = {'host':str(address),'createdAt':now.isoformat(),'expiresAt':leaf.not_valid_after_utc.isoformat(),
            'rootFingerprint':root.fingerprint(hashes.SHA256()).hex().upper(),
            'issuerConstraints':'RFC1918 IPv4, 127.0.0.1, localhost, seismosphere.local',
            'rootPrivateKeyPersisted':False}
(target/'metadata.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
print(json.dumps(metadata))
