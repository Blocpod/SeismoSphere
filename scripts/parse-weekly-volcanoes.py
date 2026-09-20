"""Decode the publisher's XML bytes with the standard library; never render feed HTML."""
import sys, json, re, math
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from email.utils import parsedate_to_datetime
from datetime import timezone
from urllib.parse import urlsplit

class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.hidden = [], 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.hidden += 1
        if tag in ('p', 'br', 'div', 'li') and not self.hidden: self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.hidden = max(0, self.hidden - 1)
        if tag in ('p', 'div', 'li') and not self.hidden: self.parts.append('\n')
    def handle_data(self, data):
        if not self.hidden: self.parts.append(data)

def date(value):
    if not value: return None
    parsed = parsedate_to_datetime(value)
    if parsed.tzinfo is None: raise ValueError('Publication date has no time zone')
    return parsed.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')

def source_url(value):
    u = urlsplit(value)
    if u.scheme != 'https' or u.netloc != 'volcano.si.edu' or u.path != '/reports_weekly.cfm':
        raise ValueError('Unexpected weekly report source URL')
    return value

def parse(raw):
    if not raw or len(raw) > 2_000_000: raise ValueError('Weekly feed exceeds 2 MB or is empty')
    if b'\x00' in raw or re.search(br'<!\s*(DOCTYPE|ENTITY)\b', raw, re.I):
        raise ValueError('XML document types and entity declarations are not supported')
    encoding = re.search(br'encoding\s*=\s*[\"\x27]([^\"\x27]+)', raw[:200], re.I)
    encoding = encoding.group(1).decode('ascii').upper() if encoding else 'UTF-8'
    if encoding not in ('UTF-8', 'UTF8', 'ISO-8859-1', 'US-ASCII'): raise ValueError('Unsupported XML encoding')
    root = ET.fromstring(raw)
    channel = root.find('channel')
    if root.tag != 'rss' or channel is None: raise ValueError('Expected an RSS channel')
    text = lambda element, key: (element.findtext(key) or '').strip() or None
    reports, seen = [], set()
    for item in channel.findall('item'):
        title, guid = text(item, 'title'), text(item, 'guid')
        if not title or not guid: raise ValueError('Report identity is missing')
        source_url(guid)
        number = re.fullmatch(r'vn_(\d{6})', urlsplit(guid).fragment)
        if not number or number.group(1) in seen: raise ValueError('Invalid or duplicate volcano identity')
        number = number.group(1)
        seen.add(number)
        match = re.fullmatch(r'(.+) \((.+)\) - Report for (.+) - (.+)', title)
        lat = lon = None
        point = text(item, '{http://www.georss.org/georss}point')
        if point:
            lat, lon = map(float, point.split())
            if not all(map(math.isfinite, (lat, lon))) or abs(lat) > 90 or abs(lon) > 180:
                raise ValueError('Invalid report coordinates')
        html = text(item, 'description') or ''
        plain = PlainText()
        plain.feed(html)
        paragraphs = [' '.join(p.split()) for p in ''.join(plain.parts).split('\n') if p.strip()]
        published = text(item, 'pubDate')
        reports.append(dict(id=number, number=number, title=title, name=match[1] if match else title,
            country=match[2] if match else None, period=match[3] if match else None,
            category=match[4] if match else None, lat=lat, lon=lon, sourcePublished=published,
            publishedAt=date(published), url=guid, text='\n\n'.join(paragraphs)))
    if not 1 <= len(reports) <= 500: raise ValueError('Expected 1–500 weekly reports')
    published = text(channel, 'pubDate')
    return dict(title=text(channel, 'title'), url=source_url(text(channel, 'link') or ''),
        copyright=text(channel, 'copyright'), encoding=encoding, sourcePublished=published,
        publishedAt=date(published), reports=sorted(reports, key=lambda r: r['id']))

if __name__ == '__main__':
    try:
        result = parse(sys.stdin.buffer.read(2_000_001))
        sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False, allow_nan=False).encode('utf-8'))
    except Exception as error:
        sys.stderr.write(str(error))
        sys.exit(1)
