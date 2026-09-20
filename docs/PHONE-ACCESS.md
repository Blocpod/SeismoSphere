# Private phone access

The host workspace stays on `http://127.0.0.1:4318`. Settings → Phone access can also serve an authenticated HTTPS workspace on a selected private IPv4 address, normally port 4438. A separate HTTP setup page on port 4319 provides instructions and the public trust certificate only. It never serves the workspace or accepts pairing credentials.

## Connect a device

1. Start SeismoSphere on the PC. In Settings → Phone access, select the current LAN address, prepare its certificate and enable sharing.
2. If Windows blocks the connection, run `Enable-Mobile-Firewall.ps1` from an Administrator PowerShell in this project. This creates a named inbound rule for only ports 4438 and 4319, the selected local address and the local subnet. It does not expose the owner port, disable the firewall, or configure the router. The rule covers all Windows network profiles because a home connection may be classified Public.
3. On the same-network phone, scan the setup QR code. Compare the certificate SHA-256 fingerprint with the one displayed on the PC before installing the certificate. On iOS, installing a downloaded profile also requires explicitly enabling certificate trust; see [Apple's instructions](https://support.apple.com/en-us/102390). Android wording depends on the device. No certificate is installed automatically.
4. Open the encrypted workspace link. Generate a one-use code on the PC, choosing controller or viewer, and enter it with a device name on the phone.
5. Revoke devices from the PC's settings when finished. Turning off phone access revokes every device and pending invitation. Remove the installed trust certificate from a device when it no longer needs the app.

The current machine address is `192.168.1.67`, making setup `http://192.168.1.67:4319` and the workspace `https://192.168.1.67:4438`. DHCP can change this address. Select the new address and prepare a new leaf certificate if that happens. An unchanged local issuer lets existing devices retain their trust certificate.

## Access boundaries

- Owner controls are available only through the loopback listener. Network devices cannot alter sharing, Windows startup or process lifecycle settings.
- Controllers can operate research and AI features, change research settings and issue records. Viewers can read the workspace and use the midpoint/analogue queries, but cannot issue records, import, fit models, change configuration or invoke the AI backend. The server enforces these permissions.
- Pairing codes contain 60 random bits, expire after ten minutes and are consumed after one successful use. Pairing attempts are limited per address and globally.
- Device tokens contain 256 random bits; only their hashes are persisted. Cookies are `Secure`, `HttpOnly`, `SameSite=Strict` and host-scoped. Sessions expire after seven days or twelve hours without authenticated requests. Automatic refresh requests count as activity. Revocation closes active device connections, including event streams.
- HTTPS requests require the configured Host header. Mutations require the matching Origin. Cross-site requests are rejected. Forwarded headers cannot grant owner access.
- This is private-LAN access for a trusted personal computer. It is not an internet-hosted multi-user service. Users with access to the Windows account or administrator control can access the local database and backend.

## Certificate lifecycle

Certificates and private keys live under ignored `data/private/tls/`. Windows ACL inheritance is removed and access is granted to the current user. Certificate preparation uses the app's local Python runtime and pinned `cryptography` dependency installed by `scripts/setup-instruments.ps1`; the bundled Python remains a fallback when no app runtime exists. `SEISMO_PYTHON` can override the executable.

The five-year root signs a three-year intermediate. The unrestricted root signing key is discarded without being written to disk. The intermediate's critical name constraints allow RFC1918 IPv4 ranges, 127.0.0.1, localhost and seismosphere.local. The retained intermediate key signs 90-day leaf certificates; the server renews a leaf during startup when fewer than fourteen days remain. TLS 1.2 is the minimum.

Issuer expiry requires an explicit trust rotation; automatic renewal refuses an issuer with fewer than 100 days remaining. There is no automatic root replacement or phone trust installation. Certificate restriction behavior still requires physical platform acceptance beyond Node's tested chain validation. Do not bypass a browser certificate error as a substitute for establishing correct trust.

### Replace an expiring trust issuer

Settings → Phone access → **Certificate maintenance** shows the connection, issuer and root expiry dates, with an issuer warning inside the 100-day renewal boundary.

1. Turn off phone access. This disconnects paired devices and clears pending invitations.
2. Choose the current PC network address and click **Prepare replacement trust**. Review its address, issuer expiry and new fingerprint. Preparing a replacement leaves the current certificate unchanged. The review survives an app restart; **Discard replacement** removes its unused signing keys.
3. Select the acknowledgment and click **Replace trust & require new pairing**. Activation validates the reviewed certificate chain, public download, private-key matches and address before atomically selecting the new generation and clearing device credentials. A stale review cannot activate another certificate.
4. Remove the old SeismoSphere trust certificate from each phone. Its fingerprint remains visible in maintenance. Enable phone access, compare the new fingerprint on the PC and phone, install the replacement trust certificate, then create new pairing codes.

Replacement never installs OS trust. Retired server/issuer keys are removed from this installation after activation; copies in backups are unaffected. The unrestricted root signing key is still never written to disk. Normal connection-certificate renewal preserves the existing trust issuer and now prepares files in a separate generation before switching, so interrupted preparation cannot overwrite the working chain.

Active and pending generation references live in SQLite; certificate generations live below `data/private/tls/generations/`. Original flat-directory certificates remain readable until their next renewal. To preserve phone access in a full installation backup, stop the app and copy the database and private TLS directory together; protect that backup as signing-key material. A research-ledger export contains no private TLS keys.

The implementation uses Node's [X509 certificate/key checks](https://nodejs.org/docs/latest-v24.x/api/crypto.html#class-x509certificate) and the existing Python [X.509 certificate builder and name constraints](https://cryptography.io/en/latest/x509/reference/#cryptography.x509.NameConstraints).

Rotation acceptance: the 94-test suite covers real TLS chain validation, legacy-directory migration, cancellation, pending-review persistence, mismatched fingerprints, altered chain/public download rejection, database rollback, old-CA rejection, credential invalidation and same-issuer leaf renewal. `node scripts/trust-rotation-check.mjs` exercises prepare/review/activate/enable/disable in an isolated installation across Chrome/WebKit at 1366×900, 320×740, 390×844 and 844×390. These checks use actual generated certificates with Node trust validation; they do not replace the main installation's trust or install a certificate on a physical phone.

## Startup and shutdown

`Launch SeismoSphere.cmd` / `Start-SeismoSphere.ps1` start a hidden backend and reuse only an instance that identifies this application and project directory. `Stop-SeismoSphere.ps1` verifies the same identity before graceful shutdown. Neither script stops unrelated Node processes. Normal shutdown preserves the enabled sharing preference; the next launch restores it if the address and certificate remain valid.

Settings has an optional current-user “start at Windows sign-in” control. It uses the named `SeismoSphere` value under HKCU's Run key and starts hidden without opening a browser. This setting remains **off** on the development machine. An existing value pointing elsewhere is treated as a conflict and is not overwritten. The launcher is not yet a packaged installer or an operating-system service.

## Verified scope

At the phone-access checkpoint, twenty automated tests passed, including certificate-chain validation, pairing replay rejection, permissions, origin rejection, expiration and revocation. `scripts/phone-access-check.mjs` also exercised controller pairing, viewer denial and revocation against the running HTTPS app using Chrome. Its browser trust exception is scoped to the exact generated leaf public key for testing; it does not install OS trust. Node independently validated the certificate chain and IP hostname using the generated root.

The actual app passed desktop/mobile WebKit rendering and dialog checks. The downloaded Firefox runtime fails to launch with a Windows side-by-side `mozglue` dependency error, before loading any page. That is an unverified engine, not a passing app test.

Actual phone connectivity, iOS/Android certificate installation and physical GPU behavior are still pending. This agent session is not Administrator, so it has not installed the firewall rule. No claim of complete mobile hardware acceptance is made.

The design follows the [OWASP session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) and uses [Node HTTPS](https://nodejs.org/api/https.html). Setup QR encoding uses [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), MIT, vendored by the asset setup script.
