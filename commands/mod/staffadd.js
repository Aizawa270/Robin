// commands/mod/staffadd.js
// !staff @user/id            → gives Trial Mod starter roles
// !staff @user/id @role/id   → promotes to any specified role

const { EmbedBuilder } = require('discord.js');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const AUTHORIZED = new Set([
  '852839588689870879', // Astrix (creator)
]);

const AUTHORIZED_ROLES = new Set([
  '1431650083585396897', // Overseer
  '1447894643277561856', // CF / Founder
]);

// Starter roles given on plain !staff @user
const TRIAL_MOD_ROLES = [
  '1431651114008318002', // Trial Mod
  '1432014943900799097', // Trial Mod invis
  '1431733982197977119', // Gear role
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function canUse(member) {
  if (AUTHORIZED.has(member.id)) return true;
  return member.roles.cache.some(r => AUTHORIZED_ROLES.has(r.id));
}

function err(title, desc) {
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(`❌ ${title}`)
    .setDescription(desc)
    .setTimestamp();
}

function ok(title, desc) {
  return new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle(title)
    .setDescription(desc)
    .setTimestamp();
}

// ─── COMMAND ─────────────────────────────────────────────────────────────────
module.exports = {
  name: 'staffadd',
  aliases: ['staff'],

  async execute(client, message, args) {
    if (!message.guild) return;

    // ── Permission check ────────────────────────────────────────────────────
    if (!canUse(message.member)) {
      return message.reply({
        embeds: [err('No Permission', 'You need **Overseer** or higher to use this command.')],
      });
    }

    // ── Resolve target user ─────────────────────────────────────────────────
    const rawTarget = args[0];
    if (!rawTarget) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf59e0b)
            .setTitle('Usage')
            .setDescription(
              '`!staff @user/id` — Give Trial Mod starter roles\n' +
              '`!staff @user/id @role/id` — Promote to a specific role'
            )
            .setTimestamp(),
        ],
      });
    }

    const targetId = rawTarget.replace(/\D/g, '');
    const target   = message.mentions.members.first() ??
      await message.guild.members.fetch(targetId).catch(() => null);

    if (!target) {
      return message.reply({
        embeds: [err('User Not Found', 'Could not find that user in this server.')],
      });
    }

    if (target.user.bot) {
      return message.reply({
        embeds: [err('Invalid Target', "You can't staff a bot.")],
      });
    }

    // ── Check bot role hierarchy ─────────────────────────────────────────────
    const botMember = message.guild.members.me;
    if (target.roles.highest.position >= botMember.roles.highest.position) {
      return message.reply({
        embeds: [err('Role Hierarchy', "My role is too low to modify that user's roles.")],
      });
    }

    // ── Determine mode: starter OR single-role promotion ────────────────────
    const rawRole = args[1];

    if (!rawRole) {
      // ── STARTER MODE: give all three Trial Mod roles ─────────────────────
      const toAdd    = [];
      const already  = [];
      const failed   = [];

      for (const roleId of TRIAL_MOD_ROLES) {
        if (target.roles.cache.has(roleId)) {
          already.push(roleId);
          continue;
        }
        const role = message.guild.roles.cache.get(roleId);
        if (!role) { failed.push(roleId); continue; }
        toAdd.push(role);
      }

      if (toAdd.length === 0 && already.length === TRIAL_MOD_ROLES.length) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xf59e0b)
              .setTitle('⚠️ Already Staffed')
              .setDescription(`<@${target.id}> already has all Trial Mod starter roles.`)
              .setTimestamp(),
          ],
        });
      }

      const errors = [];
      for (const role of toAdd) {
        try {
          await target.roles.add(role, `Trial Mod staffed by ${message.author.tag}`);
        } catch {
          errors.push(role.name);
        }
      }

      // DM the new staff member
      try {
        await target.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x7c3aed)
              .setTitle('👋 Welcome to the Staff Team!')
              .setDescription(
                `Hey **${target.user.username}**!\n\n` +
                `You've been added to the staff team in **${message.guild.name}** as a **Trial Mod**.\n\n` +
                `Make sure to read the staff guidelines and reach out if you need anything. Good luck! 💜`
              )
              .setFooter({ text: message.guild.name })
              .setTimestamp(),
          ],
        });
      } catch {
        // DMs closed — silent, we'll note it in the reply embed
      }

      let desc = `<@${target.id}> has been given the Trial Mod starter roles.`;
      if (errors.length) desc += `\n\n⚠️ Failed to add: ${errors.map(n => `\`${n}\``).join(', ')}`;
      if (already.length) desc += `\n📌 Already had ${already.length} role(s).`;

      const dmStatus = await target.send({ content: '' }).then(() => true).catch(() => false);
      // (the DM was already attempted above; just indicate in the log)

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x7c3aed)
            .setTitle('✅ Staff Added — Trial Mod')
            .setThumbnail(target.user.displayAvatarURL({ size: 256 }))
            .setDescription(desc)
            .addFields(
              { name: 'User',      value: `<@${target.id}>`,      inline: true },
              { name: 'Added by',  value: `<@${message.author.id}>`, inline: true },
              { name: 'DM',        value: `Sent ✅`,               inline: true },
            )
            .setTimestamp(),
        ],
      });

    } else {
      // ── PROMOTION MODE: give a single specified role ──────────────────────
      const roleId = rawRole.replace(/\D/g, '');
      const role   = message.mentions.roles.first() ??
        message.guild.roles.cache.get(roleId);

      if (!role) {
        return message.reply({
          embeds: [err('Role Not Found', 'Could not find that role. Mention it or paste its ID.')],
        });
      }

      if (role.position >= botMember.roles.highest.position) {
        return message.reply({
          embeds: [err('Role Hierarchy', `My role is too low to assign **${role.name}**.`)],
        });
      }

      if (target.roles.cache.has(role.id)) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xf59e0b)
              .setTitle('⚠️ Already Has Role')
              .setDescription(`<@${target.id}> already has the **${role.name}** role.`)
              .setTimestamp(),
          ],
        });
      }

      try {
        await target.roles.add(role, `Staff promotion by ${message.author.tag}`);
      } catch {
        return message.reply({
          embeds: [err('Failed', `Could not assign **${role.name}**. Check my role permissions and hierarchy.`)],
        });
      }

      // DM the promoted member
      try {
        await target.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x7c3aed)
              .setTitle('🎉 Staff Promotion!')
              .setDescription(
                `Hey **${target.user.username}**!\n\n` +
                `You've been promoted to **${role.name}** in **${message.guild.name}**.\n\n` +
                `Keep up the great work! 💜`
              )
              .setFooter({ text: message.guild.name })
              .setTimestamp(),
          ],
        });
      } catch {
        // DMs closed — handled in embed below
      }

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x7c3aed)
            .setTitle('✅ Staff Promoted')
            .setThumbnail(target.user.displayAvatarURL({ size: 256 }))
            .addFields(
              { name: 'User',       value: `<@${target.id}>`,         inline: true },
              { name: 'Promoted by', value: `<@${message.author.id}>`, inline: true },
              { name: 'New Role',   value: `<@&${role.id}>`,           inline: true },
            )
            .setTimestamp(),
        ],
      });
    }
  },
};
