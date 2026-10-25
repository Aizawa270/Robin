const path = require('path');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');
const { randomInt } = require('crypto');

const {
  formatDuration,
  useCooldown,
  boostProfit,
} = require('../../handlers/gamblingHelpers');

// ============================================
// CONFIGURATION
// ============================================

const MAX_BET = 25_000;
const COOLDOWN_MS = 10_000;

// Put your wheel image here (the PNG you sent).
const WHEEL_IMAGE_PATH = path.join(__dirname, '../../assets/spinwheel.png');

// GIF settings. Bigger size / more frames = smoother but bigger file (Discord limit 8MB).
const GIF_SIZE = 320;
const GIF_FRAMES = 90;
const GIF_FRAME_DELAY_MS = 40; // 25 fps
const FULL_TURNS = 3;
const SPIN_MS = GIF_FRAMES * GIF_FRAME_DELAY_MS;
const LOAD_BUFFER_MS = 1200; // time for Discord to upload/load the GIF before revealing

// Where the wheel's centre is inside your image, as a fraction of width/height.
// If the wheel wobbles while spinning, nudge these a little (e.g. 0.504).
const CENTER_X = 0.5;
const CENTER_Y = 0.5;

// The pointer triangle baked into your image (source-pixel coordinates).
// It is cut out of the spinning layer and redrawn fixed on top.
const POINTER = [[216, 0], [288, 0], [252, 58]];
const POINTER_PATCH_COLOR = '#14090c';

// 9 equal segments, clockwise starting just RIGHT of the pointer.
// LOST 4/9, x1 2/9, x2 2/9, x3 1/9  -> expected return is exactly 100% before boosts.
const SEGMENTS = [
  { label: 'x2', multiplier: 2 },
  { label: 'Lost', multiplier: 0 },
  { label: 'Lost', multiplier: 0 },
  { label: 'x1', multiplier: 1 },
  { label: 'Lost', multiplier: 0 },
  { label: 'x2', multiplier: 2 },
  { label: 'Lost', multiplier: 0 },
  { label: 'x1', multiplier: 1 },
  { label: 'x3', multiplier: 3 },
];

const SEGMENT_ANGLE = (Math.PI * 2) / SEGMENTS.length;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const activeSpins = new Set();
const spinKey = (guildId, userId) => `${guildId}:${userId}`;

// ============================================
// EMBEDS
// ============================================

function buildEmbed(message, data = {}) {
  let embed;

  if (typeof message.createEmbed === 'function') {
    embed = message.createEmbed({
      title: data.title,
      description: data.description,
      thumbnail: message.author.displayAvatarURL({ size: 256 }),
      footer: `Requested by ${message.author.username}`,
    });
  } else {
    embed = new EmbedBuilder().setColor(data.color || '#A3092A').setTimestamp();
    if (data.title) embed.setTitle(data.title);
    if (data.description) embed.setDescription(data.description);
    embed.setThumbnail(message.author.displayAvatarURL({ size: 256 }));
    embed.setFooter({ text: `Requested by ${message.author.username}` });
  }

  if (data.image && typeof embed.setImage === 'function') embed.setImage(data.image);
  if (data.color && typeof embed.setColor === 'function') embed.setColor(data.color);

  return embed;
}

function money(client, amount) {
  return client?.economy?.formatCurrency
    ? client.economy.formatCurrency(amount)
    : `${Number(amount || 0).toLocaleString('en-US')} Crowns`;
}

function createWheelEmbed(message, title, description, imageName) {
  return buildEmbed(message, {
    title,
    description,
    image: `attachment://${imageName}`,
    color: '#A3092A',
  });
}

// ============================================
// WHEEL RENDERING (rotates YOUR image)
// ============================================

let assetsPromise = null;

function triangle(ctx, pts, scale, ox, oy) {
  ctx.beginPath();
  ctx.moveTo(ox + pts[0][0] * scale, oy + pts[0][1] * scale);
  ctx.lineTo(ox + pts[1][0] * scale, oy + pts[1][1] * scale);
  ctx.lineTo(ox + pts[2][0] * scale, oy + pts[2][1] * scale);
  ctx.closePath();
}

async function loadAssets() {
  if (!assetsPromise) {
    assetsPromise = (async () => {
      const original = await loadImage(WHEEL_IMAGE_PATH);
      const w = original.width;
      const h = original.height;

      // Copy of the wheel with the pointer painted over, so a ghost
      // pointer doesn't rotate around the rim.
      const clean = createCanvas(w, h);
      const cctx = clean.getContext('2d');
      cctx.drawImage(original, 0, 0);
      triangle(cctx, POINTER, 1, 0, 0);
      cctx.fillStyle = POINTER_PATCH_COLOR;
      cctx.fill();

      return { original, clean, w, h };
    })();
  }
  return assetsPromise;
}

function renderFrame(assets, rotation, size = GIF_SIZE) {
  const { original, clean, w, h } = assets;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const scale = size / Math.max(w, h);
  const drawW = w * scale;
  const drawH = h * scale;
  const ox = (size - drawW) / 2;
  const oy = (size - drawH) / 2;

  ctx.fillStyle = '#1e1f22';
  ctx.fillRect(0, 0, size, size);

  // Spinning layer.
  ctx.save();
  ctx.translate(ox + drawW * CENTER_X, oy + drawH * CENTER_Y);
  ctx.rotate(rotation);
  ctx.drawImage(clean, -drawW * CENTER_X, -drawH * CENTER_Y, drawW, drawH);
  ctx.restore();

  // Fixed pointer from the original image.
  ctx.save();
  triangle(ctx, POINTER, scale, ox, oy);
  ctx.clip();
  ctx.drawImage(original, ox, oy, drawW, drawH);
  ctx.restore();

  return canvas;
}

const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

// Rotation (clockwise) that puts the centre of `index` under the pointer,
// with a little random offset so it doesn't always land dead centre.
function getTargetRotation(index) {
  const jitter = randomInt(-35, 36) / 100; // +-35% of a segment
  return Math.PI * 2 * FULL_TURNS - (index + 0.5 + jitter) * SEGMENT_ANGLE;
}

function buildSpinGif(assets, targetRotation) {
  const gif = GIFEncoder();

  for (let f = 0; f < GIF_FRAMES; f++) {
    const t = f / (GIF_FRAMES - 1);
    const canvas = renderFrame(assets, targetRotation * easeOutCubic(t));
    const { data } = canvas.getContext('2d').getImageData(0, 0, GIF_SIZE, GIF_SIZE);

    const palette = quantize(data, 128);
    const index = applyPalette(data, palette);

    gif.writeFrame(index, GIF_SIZE, GIF_SIZE, {
      palette,
      delay: GIF_FRAME_DELAY_MS,
      repeat: -1, // play once, hold the last frame
    });
  }

  gif.finish();
  return Buffer.from(gif.bytes());
}

// ============================================
// COMMAND
// ============================================

module.exports = {
  name: 'spinwheel',
  aliases: ['wheel'],
  description: 'Bet Crowns on the red-and-black spinwheel.',
  category: 'economy',
  usage: '$spinwheel <amount>',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (
      !client.economy ||
      typeof client.economy.getBalance !== 'function' ||
      typeof client.economy.removeCrowns !== 'function' ||
      typeof client.economy.addCrowns !== 'function'
    ) {
      return message.reply({
        embeds: [buildEmbed(message, { title: '⚠️ Economy Unavailable', description: 'The economy system is not ready.' })],
      });
    }

    const amountText = String(args[0] ?? '').trim();

    if (!/^\d+$/.test(amountText)) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: '🎡 Spinwheel',
            description:
              `**Usage:** \`${client.getPrefix ? client.getPrefix(message.guild.id) : '$'}spinwheel <amount>\`\n\n` +
              `Enter a whole-number bet between **1** and **${money(client, MAX_BET)}**.`,
          }),
        ],
      });
    }

    const amount = Number(amountText);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return message.reply({
        embeds: [buildEmbed(message, { title: '🎡 Invalid Bet', description: 'Your bet must be a positive whole number.' })],
      });
    }

    if (amount > MAX_BET) {
      return message.reply({
        embeds: [buildEmbed(message, { title: '🎡 Bet Too High', description: `The maximum bet is **${money(client, MAX_BET)}**.` })],
      });
    }

    const guildId = message.guild.id;
    const userId = message.author.id;
    const key = spinKey(guildId, userId);

    if (activeSpins.has(key)) {
      return message.reply({
        embeds: [buildEmbed(message, { title: '🎡 Already Spinning', description: 'Wait for your current spin to finish.' })],
      });
    }

    const currentBalance = client.economy.getBalance(guildId, userId);

    if (currentBalance < amount) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: '💸 Insufficient Crowns',
            description:
              `**Your balance:** ${money(client, currentBalance)}\n` +
              `**Your bet:** ${money(client, amount)}`,
          }),
        ],
      });
    }

    const remaining = useCooldown(guildId, userId, 'spinwheel', COOLDOWN_MS);

    if (remaining > 0) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: '⏳ Spinwheel Cooldown',
            description: `You can spin again in **${formatDuration(remaining)}**.`,
          }),
        ],
      });
    }

    activeSpins.add(key);

    try {
      const assets = await loadAssets();

      const removed = client.economy.removeCrowns(guildId, userId, amount, {
        type: 'spinwheel_bet',
        reason: 'Spinwheel wager',
        actorId: userId,
      });

      if (!removed) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: '💸 Bet Failed',
              description: 'Your balance changed before the bet could be collected. Please try again.',
            }),
          ],
        });
      }

      // Pick the result first, then build the animation that lands on it.
      const selectedIndex = randomInt(0, SEGMENTS.length);
      const selected = SEGMENTS[selectedIndex];
      const targetRotation = getTargetRotation(selectedIndex);

      let baseProfit = 0;
      let boostedProfit = 0;
      let payout = 0;

      if (selected.multiplier > 0) {
        baseProfit = amount * (selected.multiplier - 1);
        boostedProfit = Math.max(
          0,
          Math.floor(Number(boostProfit(client, guildId, userId, baseProfit)) || 0)
        );
        payout = amount + boostedProfit;

        client.economy.addCrowns(guildId, userId, payout, {
          type: 'spinwheel_win',
          reason: `Spinwheel ${selected.label} winnings`,
          actorId: userId,
        });
      }

      const balanceAfter = client.economy.getBalance(guildId, userId);

      // Render the GIF (one-off, ~1s) and the matching final still.
      const gifBuffer = buildSpinGif(assets, targetRotation);
      const finalBuffer = renderFrame(assets, targetRotation).toBuffer('image/png');

      // One message with a real spinning GIF.
      const sentMessage = await message.reply({
        embeds: [
          createWheelEmbed(
            message,
            '🔴 Spinwheel • Spinning',
            `**Bet:** ${money(client, amount)}\n\n*The wheel is spinning. Where will it land?*`,
            'spinwheel.gif'
          ),
        ],
        files: [new AttachmentBuilder(gifBuffer, { name: 'spinwheel.gif' })],
      });

      await sleep(SPIN_MS + LOAD_BUFFER_MS);

      let description;

      if (selected.multiplier === 0) {
        description =
          `**Bet:** ${money(client, amount)}\n\n` +
          '### 💔 You Lost\n' +
          'The wheel landed on **Lost**.\n' +
          `You lost **${money(client, amount)}**.\n\n` +
          `**Balance:** ${money(client, balanceAfter)}`;
      } else {
        description =
          `**Bet:** ${money(client, amount)}\n\n` +
          `### 🎉 ${boostedProfit > 0 ? 'You Won!' : 'Stake Returned'}\n` +
          `The wheel landed on **${selected.label}**!\n` +
          `**Base profit:** ${money(client, baseProfit)}\n` +
          `**Actual profit:** ${money(client, boostedProfit)}\n` +
          `**Total payout:** ${money(client, payout)}\n\n` +
          `**Balance:** ${money(client, balanceAfter)}`;
      }

      // Swap in the still of the final frame (identical to the GIF's last frame).
      await sentMessage.edit({
        embeds: [createWheelEmbed(message, '🎡 Spinwheel • Result', description, 'result.png')],
        attachments: [],
        files: [new AttachmentBuilder(finalBuffer, { name: 'result.png' })],
      });
    } catch (error) {
      console.error('[Spinwheel] Error:', error);

      try {
        await message.reply({
          embeds: [
            buildEmbed(message, {
              title: '⚠️ Spinwheel Error',
              description: 'Something went wrong while running the wheel. Check the bot console for details.',
            }),
          ],
        });
      } catch (replyError) {
        console.error('[Spinwheel] Failed to send error message:', replyError);
      }
    } finally {
      activeSpins.delete(key);
    }
  },
};
