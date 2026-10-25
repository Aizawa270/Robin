
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');
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

// These are PNG frames edited into the same Discord message.
// Keeping the frame count modest reduces unnecessary API requests.
const FRAME_COUNT = 5;
const FRAME_DELAY_MS = 700;

const CANVAS_SIZE = 640;
const CENTER = CANVAS_SIZE / 2;
const WHEEL_RADIUS = 250;

// 12 equally sized segments.
// LOST: 8/12 = 66.67%
// x2:   2/12 = 16.67%
// x3:   1/12 = 8.33%
// x4:   1/12 = 8.33%
//
// Multipliers are total payouts BEFORE any economy boost.
// Without boosts, expected payout is 11/12 of the wager.
const SEGMENTS = [
  { label: 'LOST', multiplier: 0, color: '#101014' },
  { label: '×2', multiplier: 2, color: '#690A20' },
  { label: 'LOST', multiplier: 0, color: '#101014' },
  { label: 'LOST', multiplier: 0, color: '#101014' },
  { label: '×3', multiplier: 3, color: '#970D2D' },
  { label: 'LOST', multiplier: 0, color: '#101014' },
  { label: '×2', multiplier: 2, color: '#690A20' },
  { label: 'LOST', multiplier: 0, color: '#101014' },
  { label: '×4', multiplier: 4, color: '#D4153C' },
  { label: 'LOST', multiplier: 0, color: '#101014' },
  { label: 'LOST', multiplier: 0, color: '#101014' },
  { label: 'LOST', multiplier: 0, color: '#101014' },
];

const SEGMENT_ANGLE = (Math.PI * 2) / SEGMENTS.length;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Prevent overlapping spins by the same user in a guild.
const activeSpins = new Set();

function spinKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

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
    embed = new EmbedBuilder()
      .setColor(data.color || '#A3092A')
      .setTimestamp();

    if (data.title) {
      embed.setTitle(data.title);
    }

    if (data.description) {
      embed.setDescription(data.description);
    }

    embed.setThumbnail(
      message.author.displayAvatarURL({ size: 256 })
    );

    embed.setFooter({
      text: `Requested by ${message.author.username}`,
    });
  }

  if (data.title && typeof embed.setTitle === 'function') {
    embed.setTitle(data.title);
  }

  if (
    data.description &&
    typeof embed.setDescription === 'function'
  ) {
    embed.setDescription(data.description);
  }

  if (data.image && typeof embed.setImage === 'function') {
    embed.setImage(data.image);
  }

  if (data.color && typeof embed.setColor === 'function') {
    embed.setColor(data.color);
  }

  if (typeof embed.setTimestamp === 'function') {
    embed.setTimestamp();
  }

  return embed;
}

function money(client, amount) {
  return client?.economy?.formatCurrency
    ? client.economy.formatCurrency(amount)
    : `${Number(amount || 0).toLocaleString('en-US')} Crowns`;
}

function createWheelEmbed(message, title, description) {
  return buildEmbed(message, {
    title,
    description,
    image: 'attachment://spinwheel.png',
    color: '#A3092A',
  });
}

function wheelAttachment(rotation) {
  return new AttachmentBuilder(drawWheel(rotation), {
    name: 'spinwheel.png',
  });
}

// ============================================
// WHEEL DRAWING
// ============================================

function drawWheel(rotation = 0) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  // Dark background.
  const background = ctx.createRadialGradient(
    CENTER,
    CENTER,
    30,
    CENTER,
    CENTER,
    CANVAS_SIZE * 0.75
  );

  background.addColorStop(0, '#211015');
  background.addColorStop(0.65, '#0D090C');
  background.addColorStop(1, '#050507');

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Neon outer rim.
  ctx.save();
  ctx.shadowColor = '#FF153E';
  ctx.shadowBlur = 28;

  ctx.beginPath();
  ctx.arc(CENTER, CENTER, WHEEL_RADIUS + 9, 0, Math.PI * 2);

  ctx.lineWidth = 12;
  ctx.strokeStyle = '#D60D35';
  ctx.stroke();

  ctx.restore();

  // Rotate the complete wheel while keeping the pointer stationary.
  ctx.save();
  ctx.translate(CENTER, CENTER);
  ctx.rotate(rotation);

  // Dark wheel backing.
  ctx.beginPath();
  ctx.arc(0, 0, WHEEL_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#09090C';
  ctx.fill();

  // Draw segments and labels.
  for (let i = 0; i < SEGMENTS.length; i++) {
    const segment = SEGMENTS[i];
    const start = -Math.PI / 2 + i * SEGMENT_ANGLE;
    const end = start + SEGMENT_ANGLE;
    const middle = start + SEGMENT_ANGLE / 2;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, WHEEL_RADIUS, start, end);
    ctx.closePath();

    ctx.fillStyle = segment.color;
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#E72A4D';
    ctx.stroke();

    // Keep labels inside their own segment.
    ctx.save();
    ctx.rotate(middle);
    ctx.translate(WHEEL_RADIUS * 0.68, 0);
    ctx.rotate(Math.PI / 2);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 17px sans-serif';

    ctx.shadowColor = '#FF173F';
    ctx.shadowBlur = 7;
    ctx.fillStyle = '#FFFFFF';

    ctx.fillText(segment.label, 0, 0, 85);

    ctx.restore();
  }

  // Decorative inner ring.
  ctx.beginPath();
  ctx.arc(0, 0, 103, 0, Math.PI * 2);
  ctx.strokeStyle = '#FF254B';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Center hub.
  const hub = ctx.createRadialGradient(
    -12,
    -14,
    4,
    0,
    0,
    67
  );

  hub.addColorStop(0, '#FF617C');
  hub.addColorStop(0.45, '#D31339');
  hub.addColorStop(1, '#4C0617');

  ctx.beginPath();
  ctx.arc(0, 0, 58, 0, Math.PI * 2);
  ctx.fillStyle = hub;
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.strokeStyle = '#FF8BA1';
  ctx.stroke();

  ctx.shadowColor = '#FF1744';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 29px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('V', 0, 1);

  ctx.restore();

  // Fixed pointer at the top.
  ctx.save();
  ctx.shadowColor = '#FF1744';
  ctx.shadowBlur = 18;

  ctx.beginPath();
  ctx.moveTo(CENTER - 27, 20);
  ctx.lineTo(CENTER + 27, 20);
  ctx.lineTo(CENTER, 73);
  ctx.closePath();

  ctx.fillStyle = '#FF163E';
  ctx.fill();

  ctx.lineWidth = 3;
  ctx.strokeStyle = '#FFC1CE';
  ctx.stroke();

  ctx.restore();

  return canvas.toBuffer('image/png');
}

// ============================================
// ANIMATION
// ============================================

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * The winning segment is selected BEFORE the animation.
 * The final rotation aligns its centre with the fixed top pointer.
 */
function getTargetRotation(selectedIndex) {
  const fullTurns = 7;

  return (
    Math.PI * 2 * fullTurns -
    (selectedIndex + 0.5) * SEGMENT_ANGLE
  );
}

async function animateWheel(
  message,
  sentMessage,
  selected,
  targetRotation,
  amount,
  client,
  balanceAfter
) {
  for (let frame = 1; frame <= FRAME_COUNT; frame++) {
    await sleep(FRAME_DELAY_MS);

    const progress = frame / FRAME_COUNT;
    const rotation = targetRotation * easeOutCubic(progress);
    const isFinal = frame === FRAME_COUNT;

    let description;

    if (!isFinal) {
      description =
        `**Bet:** ${money(client, amount)}\n\n` +
        'The wheel is spinning...\n' +
        '*The neon wheel is slowing down!*';
    } else {
      const payoutMultiplier = selected.multiplier;

      if (payoutMultiplier === 0) {
        description =
          `**Bet:** ${money(client, amount)}\n\n` +
          '### 💔 You Lost\n' +
          `The wheel landed on **LOST**.\n` +
          `You lost **${money(client, amount)}**.\n\n` +
          `**Balance:** ${money(client, balanceAfter)}`;
      } else {
        // boostProfit applies to profit, not the returned stake.
        // The stake was already deducted before the spin.
        const baseProfit = amount * (payoutMultiplier - 1);

        // The actual boosted profit is recorded during execution.
        // These values are provided by the caller on the final embed.
        const result = selected.result;

        description =
          `**Bet:** ${money(client, amount)}\n\n` +
          `### 🎉 ${result.boostedProfit > 0 ? 'You Won!' : 'Stake Returned'}\n` +
          `The wheel landed on **${selected.label}**!\n` +
          `**Base multiplier:** ×${payoutMultiplier}\n` +
          `**Base profit:** ${money(client, baseProfit)}\n` +
          `**Actual profit:** ${money(client, result.boostedProfit)}\n` +
          `**Total payout:** ${money(client, result.payout)}\n\n` +
          `**Balance:** ${money(client, balanceAfter)}`;
      }
    }

    const embed = createWheelEmbed(
      message,
      isFinal ? '🎡 Spinwheel • Result' : '🔴 Spinwheel • Spinning',
      description
    );

    await sentMessage.edit({
      embeds: [embed],
      attachments: [],
      files: [wheelAttachment(rotation)],
    });
  }
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
        embeds: [
          buildEmbed(message, {
            title: '⚠️ Economy Unavailable',
            description: 'The economy system is not ready.',
          }),
        ],
      });
    }

    // Validate amount.
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
        embeds: [
          buildEmbed(message, {
            title: '🎡 Invalid Bet',
            description: 'Your bet must be a positive whole number.',
          }),
        ],
      });
    }

    if (amount > MAX_BET) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: '🎡 Bet Too High',
            description:
              `The maximum bet is **${money(client, MAX_BET)}**.`,
          }),
        ],
      });
    }

    const guildId = message.guild.id;
    const userId = message.author.id;
    const key = spinKey(guildId, userId);

    if (activeSpins.has(key)) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: '🎡 Already Spinning',
            description: 'Wait for your current spin to finish.',
          }),
        ],
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

    // Use the same cooldown helper as dice.js.
    const remaining = useCooldown(
      guildId,
      userId,
      'spinwheel',
      COOLDOWN_MS
    );

    if (remaining > 0) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: '⏳ Spinwheel Cooldown',
            description:
              `You can spin again in **${formatDuration(remaining)}**.`,
          }),
        ],
      });
    }

    activeSpins.add(key);

    try {
      // Deduct the stake before the animation.
      const removed = client.economy.removeCrowns(
        guildId,
        userId,
        amount,
        {
          type: 'spinwheel_bet',
          reason: 'Spinwheel wager',
          actorId: userId,
        }
      );

      if (!removed) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: '💸 Bet Failed',
              description:
                'Your balance changed before the bet could be collected. Please try again.',
            }),
          ],
        });
      }

      // Select the result before showing the animation.
      const selectedIndex = randomInt(0, SEGMENTS.length);
      const selected = { ...SEGMENTS[selectedIndex] };
      const targetRotation = getTargetRotation(selectedIndex);

      let baseProfit = 0;
      let boostedProfit = 0;
      let payout = 0;

      if (selected.multiplier > 0) {
        baseProfit = amount * (selected.multiplier - 1);

        // Match the boost behaviour used in dice.js.
        boostedProfit = Math.max(
          0,
          Math.floor(
            Number(
              boostProfit(client, guildId, userId, baseProfit)
            ) || 0
          )
        );

        // The original stake was already deducted.
        // Return it with the boosted profit.
        payout = amount + boostedProfit;

        client.economy.addCrowns(
          guildId,
          userId,
          payout,
          {
            type: 'spinwheel_win',
            reason: `Spinwheel ${selected.label} winnings`,
            actorId: userId,
          }
        );
      }

      selected.result = {
        baseProfit,
        boostedProfit,
        payout,
      };

      // Capture the final balance after payout processing.
      const balanceAfter = client.economy.getBalance(
        guildId,
        userId
      );

      // Send the first frame.
      const initialEmbed = createWheelEmbed(
        message,
        '🔴 Spinwheel • Spinning',
        `**Bet:** ${money(client, amount)}\n\n` +
          '*The wheel is spinning. Where will it land?*'
      );

      const sentMessage = await message.reply({
        embeds: [initialEmbed],
        files: [wheelAttachment(0)],
      });

      // Animate the same message, then reveal the selected outcome.
      await animateWheel(
        message,
        sentMessage,
        selected,
        targetRotation,
        amount,
        client,
        balanceAfter
      );
    } catch (error) {
      console.error('[Spinwheel] Error:', error);

      try {
        await message.reply({
          embeds: [
            buildEmbed(message, {
              title: '⚠️ Spinwheel Error',
              description:
                'Something went wrong while running the wheel. Check the bot console for details.',
            }),
          ],
        });
      } catch (replyError) {
        console.error(
          '[Spinwheel] Failed to send error message:',
          replyError
        );
      }
    } finally {
      activeSpins.delete(key);
    }
  },
};
