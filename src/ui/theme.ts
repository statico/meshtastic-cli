export const theme = {
  bg: {
    primary: "#0a0e14",
    panel: "#0d1117",
    selected: "#2a3a50",
  },
  fg: {
    primary: "#c5c8c6",
    secondary: "#6e7681",
    accent: "#00ff9f",
    muted: "#3d444c",
  },
  packet: {
    message: "#00ff9f",
    position: "#00bfff",
    telemetry: "#ff9f00",
    nodeinfo: "#bf00ff",
    routing: "#666666",
    traceroute: "#ffff00",
    encrypted: "#ff0040",
    unknown: "#ff00ff",
    direct: "#00ff00",
    config: "#8080ff",
    // Additional port type colors - cypherpunk neon palette
    remoteHardware: "#ff0099",     // Hot pink for hardware control
    admin: "#ff3300",              // Red-orange for admin commands
    compressed: "#00ff66",         // Bright green for compressed messages
    waypoint: "#00ccff",           // Cyan for waypoints
    audio: "#ff00cc",              // Magenta for audio
    detectionSensor: "#ffcc00",    // Gold for sensors
    alert: "#ff0000",              // Bright red for alerts
    keyVerification: "#00ff00",    // Lime for security
    reply: "#99ff00",              // Yellow-green for replies
    ipTunnel: "#0099ff",           // Blue for network tunnels
    paxcounter: "#ff9933",         // Orange for paxcounter
    storeForwardPP: "#9900ff",     // Purple for S&F++
    serial: "#00ffcc",             // Turquoise for serial
    storeForward: "#cc00ff",       // Violet for S&F
    rangeTest: "#ffff33",          // Yellow for range tests
    zps: "#33ff99",                // Mint for position estimation
    simulator: "#ff3399",          // Pink for simulator
    neighborinfo: "#ff6600",       // Bright orange for neighbors
    atakPlugin: "#009933",         // Dark green for ATAK
    mapReport: "#0066ff",          // Blue for map reports
    powerstress: "#ff6666",        // Light red for power testing
    reticulumTunnel: "#6600ff",    // Deep purple for reticulum
    cayenne: "#ff9900",            // Orange for Cayenne
    privateApp: "#666666",         // Gray for private apps
    atakForwarder: "#00cc66",      // Sea green for ATAK forwarder
  },
  // Cypherpunk palette for data differentiation
  data: {
    time: "#666688",        // Subdued blue-gray for timestamps
    arrow: "#ff00ff",       // Magenta for direction arrows
    nodeFrom: "#00ffff",    // Cyan for source node
    nodeTo: "#ff66ff",      // Pink for destination
    channel: "#ffff00",     // Yellow for channel
    snr: "#00ff88",         // Green for good SNR
    snrBad: "#ff6600",      // Orange for poor SNR
    coords: "#00ddff",      // Light blue for coordinates
    altitude: "#88ff88",    // Light green for altitude
    battery: "#00ff00",     // Green for battery
    batteryLow: "#ff4400",  // Red-orange for low battery
    voltage: "#ffcc00",     // Gold for voltage
    percent: "#ff88ff",     // Pink for percentages
    hardware: "#8888ff",    // Lavender for hardware model
    hops: "#ff8800",        // Orange for hop count
    quote: "#00ffaa",       // Mint for quoted text
  },
  border: {
    normal: "#2d333b",
    focused: "#00ff9f",
  },
  status: {
    online: "#00ff9f",
    offline: "#ff0040",
  },
};
