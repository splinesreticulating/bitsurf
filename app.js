// Constants
const SURFER_SCALE = 0.1; // Shrink surfers to half size

// Canvas setup and global variables
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

// Define a base internal resolution for the canvas (retro low-res size)
const BASE_WIDTH = 320;
const BASE_HEIGHT = 200;
// Set canvas drawing buffer to base resolution
canvas.width = BASE_WIDTH;
canvas.height = BASE_HEIGHT;
// The CSS upscales it to fill screen; with image-rendering:pixelated this gives a crisp blocky look.

// Load pixel art images for background, surfer, and wave
const bgImage = new Image();
bgImage.src = 'beach_bg.png';      // Pixel-art beach background
const surferImage = new Image();
surferImage.src = 'surfer_sprite.png';  // Surfer sprite (e.g. 16x16 or 32x32 pixels)
const waveImage = new Image();
waveImage.src = 'wave_sprite.png';      // Wave sprite (e.g. a small wave crest image)

// State for simulation
const surfers = [];   // active surfers (mempool transactions waiting)
const waves = [];     // active waves (each corresponds to a new block event)
const TXS_PER_SURFER = 50; // Number of transactions each surfer represents
let txBuffer = []; // Buffer to accumulate incoming transactions

// Timing for animation
let lastTimestamp = 0;
let bobbleAngle = 0;  // angle for bobbing animation

// Utility: random helper
function randBetween(min, max) {
  return Math.random() * (max - min) + min;
}

// Configure positions: define horizon and shore in canvas coords (relative to BASE_HEIGHT)
const horizonY = BASE_HEIGHT * 0.2;  // horizon line at 20% from top
const shoreY   = BASE_HEIGHT * 0.9;  // shoreline (where waves crash) at 90% from top

// Functions to handle incoming data events
function handleNewTransaction(txData) {
  // Buffer incoming transactions
  txBuffer.push(txData);
  // Only create a surfer when we have at least TXS_PER_SURFER transactions
  if (txBuffer.length >= TXS_PER_SURFER) {
    // Optionally, you could collect all txids in the buffer for future use
    const txIds = txBuffer.map(tx => tx.hash);
    const surfer = {
      x: randBetween(BASE_WIDTH * 0.1, BASE_WIDTH * 0.9),
      y: randBetween(horizonY + (shoreY - horizonY) * 0.3, horizonY + (shoreY - horizonY) * 0.6),
      phase: Math.random() * 2 * Math.PI,
      riding: false,
      txIds: txIds, // store all txids this surfer represents
      count: TXS_PER_SURFER // number of txs represented
    };
    surfers.push(surfer);
    txBuffer = [];
  }
}

function handleNewBlock(blockData) {
  // When a new block is found, create a wave and assign some surfers to it.
  // Determine how many transactions are in this block:
  let numTx = 0;
  if (blockData.txIndexes && blockData.txIndexes.length) {
    numTx = blockData.txIndexes.length;
  } else if (blockData.nTx) {
    numTx = blockData.nTx;
  }
  if (numTx === 0) {
    return; // no transactions (unlikely for real Bitcoin blocks, except perhaps a coinbase-only block)
  }

  // Choose surfers to ride the wave. Ideally, these are the ones that were in the block.
  // If we had a way to match tx IDs, we could find those by txId. For simplicity, we'll take the earliest surfers (FIFO).
  const riders = [];
  while (riders.length < numTx && surfers.length > 0) {
    const surfer = surfers.shift();  // take from front of queue (oldest waiting)
    surfer.riding = true;
    riders.push(surfer);
  }

  // Create a wave object
  const wave = {
    y: horizonY,          // start at horizon
    // The wave travels from horizonY to shoreY
    startY: horizonY,
    endY: shoreY,
    // Time-based parameters for animation
    startTime: null,      // will set when animation starts
    duration: 5000,       // wave animation duration in ms (5 seconds from horizon to shore)
    surfers: riders       // surfers riding this wave
  };
  waves.push(wave);
}

// WebSocket connection to blockchain API for real-time data
const socket = new WebSocket('wss://ws.blockchain.info/inv');  // Blockchain.com live feed:contentReference[oaicite:9]{index=9}
socket.onopen = () => {
  // Subscribe to unconfirmed transactions and new blocks
  socket.send(JSON.stringify({ op: "unconfirmed_sub" }));  // subscribe to mempool tx:contentReference[oaicite:10]{index=10}
  socket.send(JSON.stringify({ op: "blocks_sub" }));       // subscribe to new blocks:contentReference[oaicite:11]{index=11}
  // Update status UI (if any)
  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = "Connected to Bitcoin feed";
    statusEl.style.display = 'block';
    setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
  }
};
socket.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.op === "utx") {
    // New unconfirmed transaction
    handleNewTransaction(msg.x);
  } else if (msg.op === "block") {
    // New block found
    handleNewBlock(msg.x);
  }
};
socket.onerror = (err) => {
  console.error("WebSocket error:", err);
  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = "Connection error";
    statusEl.style.display = 'block';
  }
};

// Animation loop using requestAnimationFrame for smooth updates:contentReference[oaicite:12]{index=12}
function animate(timestamp) {
  requestAnimationFrame(animate);
  if (!lastTimestamp) lastTimestamp = timestamp;
  const delta = timestamp - lastTimestamp;
  lastTimestamp = timestamp;

  // Clear the canvas for redraw
  // (Fill with background image or color)
  if (bgImage.complete) {
    // Draw the background image stretched to canvas size
    ctx.drawImage(bgImage, 0, 0, BASE_WIDTH, BASE_HEIGHT);
  } else {
    // If image not loaded, fill with sky-blue and a simple horizon/shore placeholder
    ctx.fillStyle = "#87CEEB";
    ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
    // Draw a simple horizon and shore if needed (placeholder graphics)
    ctx.fillStyle = "#1E90FF"; // ocean blue
    ctx.fillRect(0, horizonY, BASE_WIDTH, shoreY - horizonY);
    ctx.fillStyle = "#F0E68C"; // sand color
    ctx.fillRect(0, shoreY, BASE_WIDTH, BASE_HEIGHT - shoreY);
  }

  // Update bobbing animation angle
  bobbleAngle += (delta * 0.005);  // speed of bobbing (0.005 radians per ms as a rough value)
  
  // Draw surfers that are not riding a wave (waiting in mempool)
  ctx.save();
  for (const surfer of surfers) {
    if (surfer.riding) continue;  // skip if this surfer is now riding a wave (will be drawn with wave)
    // Calculate bobbing offset using a sine wave
    const bobOffset = Math.sin(bobbleAngle + surfer.phase) * 2;  // 2px amplitude bob
    const drawX = surfer.x;
    const drawY = surfer.y + bobOffset;
    if (surferImage.complete) {
      // Draw surfer sprite
      const surfWidth = surferImage.width * SURFER_SCALE;
      const surfHeight = surferImage.height * SURFER_SCALE;
      ctx.drawImage(
        surferImage,
        drawX - surfWidth/2, drawY - surfHeight/2,
        surfWidth, surfHeight
      );
    } else {
      // If image not loaded, draw a placeholder (e.g., a small colored rectangle as surfer)
      ctx.fillStyle = "#ff8c00";
      ctx.fillRect(drawX - 2, drawY - 2, 4, 4);
    }
  }
  ctx.restore();

  // Update and draw waves
  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i];
    if (!wave.startTime) wave.startTime = timestamp; // initialize start time
    // Compute progress [0,1]
    const progress = Math.min((timestamp - wave.startTime) / wave.duration, 1);
    wave.y = wave.startY + (wave.endY - wave.startY) * progress;
    // Draw the wave (a moving crest line)
    if (waveImage.complete) {
      // Tile the wave image across the canvas width for a larger wave effect
      const waveWidth = waveImage.width;
      for (let x = 0; x < BASE_WIDTH; x += waveWidth) {
        ctx.drawImage(waveImage, x, wave.y - waveImage.height/2);
      }
    } else {
      // Draw a simple arc or line as a placeholder wave
      ctx.strokeStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.moveTo(0, wave.y);
      ctx.lineTo(BASE_WIDTH, wave.y);
      ctx.stroke();
    }
    // Draw surfers riding this wave
    for (const surfer of wave.surfers) {
      // Position surfer on the wave – slightly ahead of the wave crest for effect
      const offsetY = -5; // lift surfer 5px above wave line
      const drawX = surfer.x;
      const drawY = wave.y + offsetY;
      const surfWidth = surferImage.width * SURFER_SCALE;
      const surfHeight = surferImage.height * SURFER_SCALE;
      
      if (surferImage.complete) {
        ctx.drawImage(surferImage, drawX - surferImage.width/2, drawY - surferImage.height/2, surfWidth, surfHeight);
      } else {
        ctx.fillStyle = "#ff8c00";
        ctx.fillRect(drawX - 2, drawY - 2, 4, 4);
      }
    }
    // If wave has reached the shore, remove it and its surfers
    if (progress >= 1) {
      waves.splice(i, 1);
      i--;
      // (The surfers on this wave are already removed from 'surfers' list when the wave was created, 
      // so we don't need to remove them again. They simply disappear on reaching shore.)
    }
  }
}

// Start the animation loop after assets are loaded
// We ensure the background image is loaded to avoid drawing blank screen initially.
if (bgImage.complete) {
  // If images are already cached/loaded
  requestAnimationFrame(animate);
} else {
  bgImage.onload = () => {
    requestAnimationFrame(animate);
  };
}
