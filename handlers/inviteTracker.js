// handlers/inviteTracker.js
const { EmbedBuilder } = require('discord.js');

module.exports = (client) => {
  // Store invite cache
  const inviteCache = new Map();

  // Initialize invite tracker
  client.once('ready', async () => {
    console.log('[InviteTracker] Initializing...');

    // Tables are now created in index.js, so we just verify they exist
    try {
      // Verify tables exist
      const tables = client.automodDB.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name IN ('invite_tracker', 'invite_stats')
      `).all();
      
      console.log(`[InviteTracker] Found ${tables.length} tables in database`);
    } catch (err) {
      console.error('[InviteTracker] Database error:', err);
    }

    // Cache invites for all guilds
    for (const guild of client.guilds.cache.values()) {
      try {
        const invites = await guild.invites.fetch();
        inviteCache.set(guild.id, new Map(invites.map(inv => [inv.code, inv.uses])));
        console.log(`[InviteTracker] Cached ${invites.size} invites for ${guild.name}`);
      } catch (err) {
        console.error(`[InviteTracker] Failed to cache invites for ${guild.name}:`, err);
      }
    }

    console.log('[InviteTracker] ✅ System initialized');
  });

  // Update cache when invite is created
  client.on('inviteCreate', (invite) => {
    const guildInvites = inviteCache.get(invite.guild.id) || new Map();
    guildInvites.set(invite.code, invite.uses);
    inviteCache.set(invite.guild.id, guildInvites);
    console.log(`[InviteTracker] Cached new invite: ${invite.code}`);
  });

  // Update cache when invite is deleted
  client.on('inviteDelete', (invite) => {
    const guildInvites = inviteCache.get(invite.guild.id);
    if (guildInvites) {
      guildInvites.delete(invite.code);
      console.log(`[InviteTracker] Removed deleted invite: ${invite.code}`);
    }
  });

  // Track member joins
  client.on('guildMemberAdd', async (member) => {
    try {
      if (member.user.bot) return;

      const guild = member.guild;
      const cachedInvites = inviteCache.get(guild.id);

      if (!cachedInvites) {
        console.log('[InviteTracker] No cached invites for guild');
        return;
      }

      // Fetch current invites
      const currentInvites = await guild.invites.fetch();

      // Find which invite was used
      let usedInvite = null;
      let inviter = null;

      for (const [code, invite] of currentInvites) {
        const cachedUses = cachedInvites.get(code) || 0;

        if (invite.uses > cachedUses) {
          usedInvite = invite;
          inviter = invite.inviter;
          break;
        }
      }

      // Update cache with new invite uses
      inviteCache.set(guild.id, new Map(currentInvites.map(inv => [inv.code, inv.uses])));

      // If no inviter found, check vanity URL
      if (!inviter && guild.vanityURLCode) {
        try {
          const vanityData = await guild.fetchVanityData();
          if (vanityData && vanityData.uses > 0) {
            // Check if vanity uses increased (this is tricky, we'll assume it's vanity if no other invite was used)
            inviter = null; // Vanity invites don't have an inviter
            console.log(`[InviteTracker] User ${member.user.tag} joined via vanity URL (self-join)`);
            return; // Don't track vanity self-joins
          }
        } catch (err) {
          console.error('[InviteTracker] Failed to fetch vanity data:', err);
        }
      }

      if (!inviter) {
        console.log(`[InviteTracker] Could not determine inviter for ${member.user.tag}`);
        return;
      }

      // Check if this user already exists in tracker (returning user)
      const existing = client.automodDB.prepare(`
        SELECT inviter_id FROM invite_tracker 
        WHERE guild_id = ? AND invited_id = ?
      `).get(guild.id, member.id);

      if (existing) {
        console.log(`[InviteTracker] ${member.user.tag} is a returning member - not counting`);
        return;
      }

      // Add to tracker
      client.automodDB.prepare(`
        INSERT OR REPLACE INTO invite_tracker (guild_id, inviter_id, invited_id, joined_at)
        VALUES (?, ?, ?, ?)
      `).run(guild.id, inviter.id, member.id, Date.now());

      // Update inviter stats
      client.automodDB.prepare(`
        INSERT INTO invite_stats (guild_id, user_id, invite_count)
        VALUES (?, ?, 1)
        ON CONFLICT(guild_id, user_id) DO UPDATE SET
          invite_count = invite_count + 1
      `).run(guild.id, inviter.id);

      console.log(`[InviteTracker] ${member.user.tag} invited by ${inviter.tag} (code: ${usedInvite.code})`);

    } catch (err) {
      console.error('[InviteTracker] Error tracking join:', err);
    }
  });

  // Handle member leaves (decrease count)
  client.on('guildMemberRemove', async (member) => {
    try {
      if (member.user.bot) return;

      const guild = member.guild;

      // Check if this user was tracked
      const tracked = client.automodDB.prepare(`
        SELECT inviter_id FROM invite_tracker 
        WHERE guild_id = ? AND invited_id = ?
      `).get(guild.id, member.id);

      if (tracked) {
        // Decrease inviter's count
        client.automodDB.prepare(`
          UPDATE invite_stats 
          SET invite_count = invite_count - 1
          WHERE guild_id = ? AND user_id = ?
        `).run(guild.id, tracked.inviter_id);

        // Remove from tracker (so they can be tracked again if they rejoin)
        client.automodDB.prepare(`
          DELETE FROM invite_tracker
          WHERE guild_id = ? AND invited_id = ?
        `).run(guild.id, member.id);

        console.log(`[InviteTracker] ${member.user.tag} left - decreased inviter's count`);
      }

    } catch (err) {
      console.error('[InviteTracker] Error handling leave:', err);
    }
  });

  console.log('[InviteTracker] Handler loaded');
};
