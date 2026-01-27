QuietSignal – Live Noise Monitoring Dashboard

This project displays a real-time classroom camera feed and simulated noise monitoring
data using a local MediaMTX server and WebRTC streaming.

────────────────────────────────
HOW THE LIVE CAMERA WORKS
────────────────────────────────
• The camera streams to MediaMTX running on a laptop
• MediaMTX rebroadcasts the stream via WebRTC (WHEP)
• The web app (GitHub Pages) connects to MediaMTX over local Wi‑Fi
• The camera is ONLY accessible on the same local network

This design was chosen for:
✓ Low latency
✓ High reliability
✓ No cloud cost
✓ Strong privacy and security

────────────────────────────────
REQUIREMENTS TO RUN THE LIVE DEMO
────────────────────────────────
1. Laptop running MediaMTX
2. Camera connected to MediaMTX
3. Laptop and viewing devices on the SAME Wi‑Fi
4. Open the GitHub Pages link in a browser
5. Allow “Local Network Access” when prompted (mobile devices)

────────────────────────────────
IMPORTANT NOTES
────────────────────────────────
• The live camera feed will NOT work outside the local network
• This is intentional for privacy and safety reasons
• No external servers or cloud streaming are used

────────────────────────────────
TECH STACK
────────────────────────────────
• HTML / CSS / JavaScript
• WebRTC (WHEP)
• MediaMTX
• GitHub Pages (static hosting)
