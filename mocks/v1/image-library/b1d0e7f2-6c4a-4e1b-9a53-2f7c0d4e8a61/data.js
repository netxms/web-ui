// Drawing of the demo Meet-Me Room (4800 x 3600 mm) at 5 mm a pixel, so the room's uncalibrated
// backdrop, stretched to the outline's width, lines up with the walls.
const TILE = 120
const grid = []
for (let x = TILE; x < 960; x += TILE) grid.push(`<line x1="${x}" y1="0" x2="${x}" y2="720"/>`)
for (let y = TILE; y < 720; y += TILE) grid.push(`<line x1="0" y1="${y}" x2="960" y2="${y}"/>`)

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">
  <rect width="960" height="720" fill="#f6f3ea"/>
  <g stroke="#dcd5c3" stroke-width="1">${grid.join('')}</g>
  <g fill="none" stroke="#2f3b4a">
    <path d="M 0 480 V 0 H 960 V 720 H 0 V 660" stroke-width="8"/>
    <path d="M 0 480 A 180 180 0 0 1 180 660" stroke-width="1.5" stroke-dasharray="6 4"/>
    <line x1="0" y1="480" x2="180" y2="480" stroke-width="2"/>
    <rect x="120" y="640" width="360" height="80" stroke-width="2"/>
    <path d="M 160 100 H 900 M 160 124 H 900" stroke-width="2" stroke-dasharray="14 6"/>
    <rect x="700" y="24" width="236" height="64" stroke-width="1.5"/>
    <path d="M 520 690 H 720 M 520 682 V 698 M 620 686 V 694 M 720 682 V 698" stroke-width="2"/>
  </g>
  <g font-family="Arial, Helvetica, sans-serif" fill="#2f3b4a">
    <text x="530" y="94" font-size="14">CABLE TRAY 300</text>
    <text x="300" y="686" font-size="16" text-anchor="middle">ODF FRAMES</text>
    <text x="40" y="580" font-size="13">ENTRY</text>
    <text x="712" y="50" font-size="16" font-weight="700">MEET-ME ROOM</text>
    <text x="712" y="74" font-size="13">LEVEL 1  /  SCALE 1:50</text>
    <text x="520" y="676" font-size="12">0</text>
    <text x="720" y="676" font-size="12" text-anchor="middle">1 m</text>
  </g>
</svg>`

export default function imageData(req, res) {
  res.setHeader('Content-Type', 'image/svg+xml')
  res.end(SVG)
}
