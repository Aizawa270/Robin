const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// ===== CONFIG (optional) =====
let config = null;
try { config = require('../../config'); } catch {}

// ===== PERMISSION HELPERS (same as quarantine) =====
function getBotOwnerIds(client) {
  const ids = new Set();
  if (config?.ownerId) ids.add(String(config.ownerId));
  if (client?.ownerId) ids.add(String(client.ownerId));
  if (client?.ownerIds && Array.isArray(client.ownerIds)) {
    for (const id of client.ownerIds) ids.add(String(id));
  }
  if (process.env.OWNER_ID) ids.add(String(process.env.OWNER_ID));
  return ids;
}

function isBotOwner(client, userId) {
  return getBotOwnerIds(client).has(String(userId));
}

// Who can configure / manage access (bot owner + server owner)
function canManageStaff(client, member) {
  if (!member) return false;
  if (member.id === member.guild.ownerId) return true;
  if (isBotOwner(client, member.id)) return true;
  return false;
}

// Who can actually use `staffadd @user` (bot owner / server owner / access entries)
function canUseStaffAdd(client, member) {
  if (canManageStaff(client, member)) return true;

  // Check direct user access
  const userEntry = client.staffaddDB.prepare(
    'SELECT 1 FROM staffadd_access WHERE guild_id = ? AND target_type = ? AND target_id = ?'
  ).get(member.guild.id, 'user', member.id);
  if (userEntry) return true;

  // Check role‑based access
  const roleEntries = client.staffaddDB.prepare(
    'SELECT target_id FROM staffadd_access WHERE guild_id = ? AND target_type = ?'
  ).all(member.guild.id, 'role');
  for (const entry of roleEntries) {
    if (member.roles.cache.has(entry.target_id)) return true;
  }

  return false;
}

// ===== DATABASE INIT (lazy – no index.js changes) =====
function ensureStaffAddDB(client) {
  if (client._staffaddReady) return;

  const dataDir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const db = new Database(path.join(dataDir, 'staffadd.sqlite'));
  db.pragma('journal_mode = WAL');
  db.prepare(`
    CREATE TABLE IF NOT EXISTS staffadd_settings (
      guild_id TEXT PRIMARY KEY,
      roles TEXT NOT NULL
    )
  `).run();
  db.prepare(`
    CREATE TABLE IF NOT EXISTS staffadd_access (
      guild_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, target_type, target_id)
    )
  `).run();

  client.staffaddDB = db;
  client._staffaddReady = true;
}

// ===== UTILITY FUNCTIONS =====
function resolveRole(guild, input) {
  if (!input) return null;
  const raw = String(input).trim();
  const cleaned = raw.replace(/[<@&>]/g, '');

  const byId = guild.roles.cache.get(cleaned);
  if (byId) return byId;

  const byName = guild.roles.cache.find(r => r.name.toLowerCase() === cleaned.toLowerCase());
  return byName || null;
}

async function resolveAccessTarget(message, raw) {
  // raw can be a mention, ID, or name for a user or role
  if (!raw) return null;

  // Mention or ID for user
  const id = raw.replace(/[<@!>]/g, '');
  if (/^\d{15,20}$/.test(id)) {
    // Could be user or role
    const role = message.guild.roles.cache.get(id);
    if (role) return { type: 'role', id: role.id, label: `<@&${role.id}>` };

    const user = await message.client.users.fetch(id).catch(() => null);
    if (user) return { type: 'user', id: user.id, label: `<@${user.id}>` };
    return null;
  }

  // Role mention
  if (raw.startsWith('<@&')) {
    const role = message.guild.roles.cache.get(raw.replace(/\D/g, ''));
    if (role) return { type: 'role', id: role.id, label: `<@&${role.id}>` };
    return null;
  }

  // User mention
  if (raw.startsWith('<@')) {
    const user = message.mentions.users.first();
    if (user) return { type: 'user', id: user.id, label: `<@${user.id}>` };
    return null;
  }

  // Name search: try role first, then user
  const lowered = raw.toLowerCase();
  const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === lowered);
  if (role) return { type: 'role', id: role.id, label: `<@&${role.id}>` };

  // For user search we use the universal resolver if available, otherwise simple cache
  if (typeof message.resolveUser === 'function') {
    const user = await message.resolveUser(raw);
    if (user) return { type: 'user', id: user.id, label: `<@${user.id}>` };
  }
  // fallback user search
  const member = message.guild.members.cache.find(m =>
    m.displayName.toLowerCase() === lowered ||
    m.user.username.toLowerCase() === lowered
  );
  if (member) return { type: 'user', id: member.user.id, label: `<@${member.user.id}>` };

  return null;
}

// ===== COMMAND =====
module.exports = {
  name: 'staffadd',
  aliases: ['staff'],
  description: 'Configure and assign staff starter roles.',
  category: 'mod',
  usage: 'staffadd [setup <@role...>] [remove all] [access add/remove/list] [@user]',
  async execute(client, message, args) {
    if (!message.guild) return;
    ensureStaffAddDB(client);
    const prefix = client.getPrefix(message.guild.id);

    // No args → show current configured roles
    if (!args[0]) {
      const row = client.staffaddDB.prepare('SELECT roles FROM staffadd_settings WHERE guild_id = ?').get(message.guild.id);
      if (!row) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#f59e0b')
              .setDescription('No staff starter roles have been configured.')
              .setFooter({ text: `Use ${prefix}staffadd setup @role ... to configure` })
          ]
        });
      }

      const roles = JSON.parse(row.roles);
      const mentions = roles.map(id => `<@&${id}>`).join('\n');
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#7c3aed')
            .setTitle('Staff Starter Roles')
            .setDescription(mentions || 'None')
            .setFooter({ text: `${roles.length} role(s) configured` })
        ]
      });
    }

    const sub = args[0].toLowerCase();

    // ─── SETUP ───────────────────────────────────────────────
    if (sub === 'setup') {
      if (!canManageStaff(client, message.member)) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#ef4444')
              .setDescription('Only the bot owner or server owner can configure staff roles.')
          ]
        });
      }

      const roleArgs = args.slice(1);
      if (!roleArgs.length) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#f59e0b')
              .setDescription(`Usage: \`${prefix}staffadd setup @role @role ...\``)
          ]
        });
      }

      const roles = [];
      const invalid = [];
      for (const raw of roleArgs) {
        const role = resolveRole(message.guild, raw);
        if (role) {
          if (!roles.find(r => r.id === role.id)) roles.push(role);
        } else {
          invalid.push(raw);
        }
      }

      if (!roles.length) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#ef4444')
              .setDescription('No valid roles found. Provide role mentions or IDs.')
          ]
        });
      }

      // Save as JSON array of IDs
      client.staffaddDB.prepare('INSERT OR REPLACE INTO staffadd_settings (guild_id, roles) VALUES (?, ?)')
        .run(message.guild.id, JSON.stringify(roles.map(r => r.id)));

      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('Staff Roles Configured')
        .setDescription(roles.map(r => `<@&${r.id}>`).join('\n'))
        .setFooter({ text: `${roles.length} role(s) saved` });

      if (invalid.length) {
        embed.addFields({ name: 'Skipped', value: invalid.join(', ') });
      }

      return message.reply({ embeds: [embed] });
    }

    // ─── REMOVE ──────────────────────────────────────────────
    if (sub === 'remove') {
      if (!canManageStaff(client, message.member)) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#ef4444')
              .setDescription('Only the bot owner or server owner can remove staff configuration.')
          ]
        });
      }

      if (args[1]?.toLowerCase() !== 'all') {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#f59e0b')
              .setDescription(`Usage: \`${prefix}staffadd remove all\``)
          ]
        });
      }

      client.staffaddDB.prepare('DELETE FROM staffadd_settings WHERE guild_id = ?').run(message.guild.id);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#22c55e')
            .setDescription('Staff starter roles have been removed.')
        ]
      });
    }

    // ─── ACCESS MANAGEMENT ───────────────────────────────────
    if (sub === 'access') {
      if (!canManageStaff(client, message.member)) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#ef4444')
              .setDescription('Only the bot owner or server owner can manage staffadd access.')
          ]
        });
      }

      const action = args[1]?.toLowerCase();
      if (!action || !['add', 'remove', 'list'].includes(action)) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#f59e0b')
              .setTitle('StaffAdd Access')
              .setDescription(
                `\`${prefix}staffadd access add @user/@role\`\n` +
                `\`${prefix}staffadd access remove @user/@role\`\n` +
                `\`${prefix}staffadd access list\``
              )
          ]
        });
      }

      // List access
      if (action === 'list') {
        const rows = client.staffaddDB.prepare(
          'SELECT target_type, target_id FROM staffadd_access WHERE guild_id = ? ORDER BY target_type, target_id'
        ).all(message.guild.id);

        const roles = rows.filter(r => r.target_type === 'role').map(r => `<@&${r.target_id}>`);
        const users = rows.filter(r => r.target_type === 'user').map(r => `<@${r.target_id}>`);

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#3b82f6')
              .setTitle('StaffAdd Access List')
              .setDescription(
                rows.length
                  ? `**Roles:**\n${roles.length ? roles.join('\n') : 'None'}\n\n**Users:**\n${users.length ? users.join('\n') : 'None'}`
                  : 'No access entries.'
              )
          ]
        });
      }

      // Add / Remove
      const targetArg = args[2];
      if (!targetArg) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#f59e0b')
              .setDescription(`Provide a user or role.\nExample: \`${prefix}staffadd access add @Moderator\``)
          ]
        });
      }

      const target = await resolveAccessTarget(message, targetArg);
      if (!target) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#ef4444')
              .setDescription('Could not resolve that user or role.')
          ]
        });
      }

      if (action === 'add') {
        client.staffaddDB.prepare(
          'INSERT OR IGNORE INTO staffadd_access (guild_id, target_type, target_id) VALUES (?, ?, ?)'
        ).run(message.guild.id, target.type, target.id);
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#22c55e')
              .setDescription(`${target.label} can now use \`staffadd @user\`.`)
          ]
        });
      }

      // remove
      client.staffaddDB.prepare(
        'DELETE FROM staffadd_access WHERE guild_id = ? AND target_type = ? AND target_id = ?'
      ).run(message.guild.id, target.type, target.id);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription(`${target.label} can no longer use \`staffadd @user\`.`)
        ]
      });
    }

    // ─── GIVE ROLES TO A USER ────────────────────────────────
    // If none of the above, treat as a user target
    if (!canUseStaffAdd(client, message.member)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription('You do not have permission to staff members.')
        ]
      });
    }

    const row = client.staffaddDB.prepare('SELECT roles FROM staffadd_settings WHERE guild_id = ?').get(message.guild.id);
    if (!row) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#f59e0b')
            .setDescription(`No staff starter roles configured. Use \`${prefix}staffadd setup ...\` first.`)
        ]
      });
    }

    const roleIds = JSON.parse(row.roles);
    if (!roleIds.length) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#f59e0b')
            .setDescription('No roles in the configuration.')
        ]
      });
    }

    // Resolve target user
    let targetUser;
    if (typeof message.resolveUser === 'function') {
      targetUser = await message.resolveUser(args[0]);
    }
    if (!targetUser) {
      // fallback for mention or ID just in case
      const id = args[0]?.replace(/[<@!>]/g, '');
      if (id && /^\d{15,20}$/.test(id)) {
        targetUser = await client.users.fetch(id).catch(() => null);
      }
    }
    if (!targetUser) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription('Could not find that user.')
        ]
      });
    }

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription('That user is not in the server.')
        ]
      });
    }

    if (member.user.bot) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription('You cannot staff a bot.')
        ]
      });
    }

    // Add roles
    const added = [];
    const already = [];
    const failed = [];

    for (const roleId of roleIds) {
      const role = message.guild.roles.cache.get(roleId);
      if (!role) {
        failed.push(roleId);
        continue;
      }
      if (member.roles.cache.has(roleId)) {
        already.push(role.name);
        continue;
      }
      try {
        await member.roles.add(role, `Staffadd by ${message.author.tag}`);
        added.push(role.name);
      } catch {
        failed.push(role.name);
      }
    }

    if (added.length === 0 && already.length === 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#f59e0b')
            .setDescription('No new roles could be added.')
        ]
      });
    }

    const embed = new EmbedBuilder()
      .setColor('#7c3aed')
      .setTitle('Staff Roles Added')
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'User', value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
        { name: 'Added by', value: message.author.tag, inline: true }
      );

    if (added.length) embed.addFields({ name: 'Added', value: added.map(r => `\`${r}\``).join(', '), inline: false });
    if (already.length) embed.addFields({ name: 'Already had', value: already.map(r => `\`${r}\``).join(', '), inline: false });
    if (failed.length) embed.addFields({ name: 'Failed', value: failed.map(r => `\`${r}\``).join(', '), inline: false });

    return message.reply({ embeds: [embed] });
  }
};