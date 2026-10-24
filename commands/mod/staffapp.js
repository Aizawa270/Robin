const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const universalHelper = require('../../handlers/universalHelper');

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');

// ============================================================
// CONFIGURATION
// ============================================================

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(
  path.join(DATA_DIR, 'staffapp.sqlite')
);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

const DEFAULT_COLOR =
  universalHelper.DEFAULT_COLOR || '#5b0000';

const MAX_QUESTIONS = 10;
const MAX_QUESTION_LENGTH = 180;
const MAX_ANSWER_LENGTH = 350;
const COOLDOWN_MONTHS = 1;
const DELETE_DELAY_MS = 10 * 60 * 1000;

const deletionTimers = new Map();

// ============================================================
// DATABASE TABLES
// ============================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS staffapp_config (
    guild_id TEXT PRIMARY KEY,
    setup_confirmed INTEGER NOT NULL DEFAULT 0,
    next_app_number INTEGER NOT NULL DEFAULT 1,
    panel_channel_id TEXT,
    panel_message_id TEXT
  );

  CREATE TABLE IF NOT EXISTS staffapp_questions (
    guild_id TEXT NOT NULL,
    question_number INTEGER NOT NULL
      CHECK(question_number BETWEEN 1 AND 10),
    question_text TEXT NOT NULL,

    PRIMARY KEY (guild_id, question_number)
  );

  CREATE TABLE IF NOT EXISTS staffapp_reviewers (
    guild_id TEXT NOT NULL,
    target_type TEXT NOT NULL
      CHECK(target_type IN ('user', 'role')),
    target_id TEXT NOT NULL,

    PRIMARY KEY (guild_id, target_type, target_id)
  );

  CREATE TABLE IF NOT EXISTS staffapp_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    app_number INTEGER NOT NULL,
    user_id TEXT NOT NULL,

    channel_id TEXT,
    application_message_id TEXT,
    submission_message_id TEXT,
    review_message_id TEXT,

    status TEXT NOT NULL DEFAULT 'creating',
    created_at INTEGER NOT NULL,
    submitted_at INTEGER,
    decided_at INTEGER,
    decision_by TEXT,
    delete_at INTEGER,

    UNIQUE (guild_id, app_number)
  );

  CREATE TABLE IF NOT EXISTS staffapp_application_questions (
    application_id INTEGER NOT NULL,
    question_number INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    answer TEXT NOT NULL DEFAULT '',
    answered_at INTEGER,

    PRIMARY KEY (application_id, question_number),

    FOREIGN KEY (application_id)
      REFERENCES staffapp_applications(id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS staffapp_application_user_index
    ON staffapp_applications(guild_id, user_id, submitted_at);

  CREATE INDEX IF NOT EXISTS staffapp_application_status_index
    ON staffapp_applications(guild_id, status);

  CREATE UNIQUE INDEX IF NOT EXISTS staffapp_one_active_application
    ON staffapp_applications(guild_id, user_id)
    WHERE status IN ('creating', 'in_progress');
`);

// ============================================================
// BASIC HELPERS
// ============================================================

function ensureConfig(guildId) {
  db.prepare(`
    INSERT OR IGNORE INTO staffapp_config (guild_id)
    VALUES (?)
  `).run(guildId);

  return db.prepare(`
    SELECT *
    FROM staffapp_config
    WHERE guild_id = ?
  `).get(guildId);
}

function getApplication(applicationId) {
  return db.prepare(`
    SELECT *
    FROM staffapp_applications
    WHERE id = ?
  `).get(applicationId);
}

function getApplicationQuestions(applicationId) {
  return db.prepare(`
    SELECT *
    FROM staffapp_application_questions
    WHERE application_id = ?
    ORDER BY question_number ASC
  `).all(applicationId);
}

function getGuildQuestions(guildId) {
  return db.prepare(`
    SELECT question_number, question_text
    FROM staffapp_questions
    WHERE guild_id = ?
    ORDER BY question_number ASC
  `).all(guildId);
}

function makeEmbed(title, description, guild = null) {
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setTitle(title)
    .setDescription(description);

  if (guild) {
    const icon = guild.iconURL({ size: 256 });

    embed.setAuthor({
      name: guild.name,
      ...(icon ? { iconURL: icon } : {}),
    });

    embed.setFooter({
      text: `STAFF RECRUITMENT • ${guild.name}`,
    });
  }

  return embed;
}

function getGuildIcon(guild) {
  return guild.iconURL({ size: 256 }) || undefined;
}

function getRemainingTime(timestamp) {
  const remaining = Math.max(0, timestamp - Date.now());

  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);

  const parts = [];

  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);

  if (minutes || parts.length === 0) {
    parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  }

  return parts.join(', ');
}

// Adds one calendar month, clamping to the target month's last day.
function addOneCalendarMonth(timestamp) {
  const date = new Date(timestamp);

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  const targetMonthIndex = month + COOLDOWN_MONTHS;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = targetMonthIndex % 12;

  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0)
  ).getUTCDate();

  return Date.UTC(
    targetYear,
    normalizedMonth,
    Math.min(day, lastDayOfTargetMonth),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds()
  );
}

// ============================================================
// DISCORD APPLICATION OWNER
// ============================================================

async function refreshBotOwnerIds(client) {
  const ownerIds = new Set();

  try {
    if (client.application?.fetch) {
      await client.application.fetch();
    }
  } catch (error) {
    console.warn(
      '[StaffApp] Could not refresh Discord application ownership:',
      error.message
    );
  }

  const owner = client.application?.owner;

  if (owner?.username && owner?.id) {
    ownerIds.add(String(owner.id));
  }

  // Team-owned applications expose the team owner's ID.
  if (owner?.ownerId) {
    ownerIds.add(String(owner.ownerId));
  }

  if (owner?.owner?.id) {
    ownerIds.add(String(owner.owner.id));
  }

  if (owner?.owner?.user?.id) {
    ownerIds.add(String(owner.owner.user.id));
  }

  client.staffAppBotOwnerIds = ownerIds;

  return ownerIds;
}

async function isBotOwner(client, userId) {
  let owners = client.staffAppBotOwnerIds;

  if (!owners || owners.size === 0) {
    owners = await refreshBotOwnerIds(client);
  }

  return owners.has(String(userId));
}

// ============================================================
// ADMINISTRATOR / REVIEWER PERMISSIONS
// ============================================================

async function canManageSetup(
  client,
  guild,
  member,
  userId
) {
  if (guild.ownerId === userId) {
    return true;
  }

  if (await isBotOwner(client, userId)) {
    return true;
  }

  return Boolean(
    member?.permissions?.has(PermissionFlagsBits.Administrator)
  );
}

function getMemberRoleIds(member) {
  if (member?.roles?.cache) {
    return new Set(member.roles.cache.keys());
  }

  if (Array.isArray(member?.roles)) {
    return new Set(member.roles.map(String));
  }

  return new Set();
}

async function canReview(
  client,
  guild,
  member,
  userId,
  memberPermissions = null
) {
  if (guild.ownerId === userId) {
    return true;
  }

  if (await isBotOwner(client, userId)) {
    return true;
  }

  const permissions =
    memberPermissions || member?.permissions;

  if (permissions?.has?.(PermissionFlagsBits.Administrator)) {
    return true;
  }

  const permissionsForGuild = db.prepare(`
    SELECT target_type, target_id
    FROM staffapp_reviewers
    WHERE guild_id = ?
  `).all(guild.id);

  if (
    permissionsForGuild.some(
      entry =>
        entry.target_type === 'user' &&
        entry.target_id === userId
    )
  ) {
    return true;
  }

  const roleIds = getMemberRoleIds(member);

  return permissionsForGuild.some(
    entry =>
      entry.target_type === 'role' &&
      roleIds.has(entry.target_id)
  );
}

// ============================================================
// RECRUITMENT PANEL EMBED
// ============================================================

function buildRecruitmentEmbed(guild) {
  const icon = getGuildIcon(guild);

  return new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setAuthor({
      name: guild.name,
      ...(icon ? { iconURL: icon } : {}),
    })
    .setTitle('✦ Staff Applications')
    .setDescription(
      [
        "We're looking for dedicated members to join our staff team.",
        '',
        "Interested in helping the community grow? Think you have what it takes to become a staff member? We'd love to hear from you.",
        '',
        '━━━━━━━━━━━━━━━━━━━━━━',
        '',
        '**✦ REQUIREMENTS**',
        '> ・ Be active and approachable.',
        '> ・ Treat everyone with respect.',
        '> ・ Be responsible and mature.',
        '',
        '**✦ BEFORE YOU APPLY**',
        '> Make sure you\'re ready to take on the responsibilities of a staff member. All applications will be reviewed by our team.',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━',
        '',
        '**Ready to join the team?**',
        '',
        'Click the **Apply** button below to begin your application.',
        '',
        '*Good luck to all applicants.*',
      ].join('\n')
    )
    .setThumbnail(icon || null)
    .setFooter({
      text: `STAFF RECRUITMENT • ${guild.name}`,
    })
    .setTimestamp();
}

function buildPanelComponents(enabled) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('staffapp:apply')
        .setLabel('Apply')
        .setEmoji('📝')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!enabled)
    ),
  ];
}

// ============================================================
// PANEL UPDATE / REFRESH
// ============================================================

async function updateSavedPanel(client, guildId) {
  const config = ensureConfig(guildId);

  if (!config.panel_channel_id || !config.panel_message_id) {
    return;
  }

  const guild =
    client.guilds.cache.get(guildId) ||
    await client.guilds.fetch(guildId).catch(() => null);

  if (!guild) return;

  const channel = await client.channels
    .fetch(config.panel_channel_id)
    .catch(() => null);

  if (!channel?.messages) return;

  const message = await channel.messages
    .fetch(config.panel_message_id)
    .catch(() => null);

  if (!message) return;

  await message.edit({
    embeds: [buildRecruitmentEmbed(guild)],
    components: buildPanelComponents(
      config.setup_confirmed === 1
    ),
  }).catch(error => {
    console.error('[StaffApp] Could not update recruitment panel:', error);
  });
}

// ============================================================
// APPLICATION FORM EMBED / COMPONENTS
// ============================================================

function buildApplicationFormEmbed(
  guild,
  application,
  questions
) {
  const icon = getGuildIcon(guild);

  const embed = new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setAuthor({
      name: guild.name,
      ...(icon ? { iconURL: icon } : {}),
    })
    .setTitle('✦ Staff Application')
    .setDescription(
      [
        'Please answer every question using its matching button below.',
        '',
        'Your answers are saved as you go. You may reopen a question to change your answer before submitting.',
        '',
        '**Application questions**',
      ].join('\n')
    )
    .setFooter({
      text: `STAFF RECRUITMENT • ${guild.name} • APPLICATION #${application.app_number}`,
    });

  for (const question of questions) {
    const answered = Boolean(question.answer?.trim());

    embed.addFields({
      name: `Question ${question.question_number}`,
      value: [
        question.question_text,
        '',
        answered
          ? '✅ Answer saved'
          : 'Select the matching button below to answer.',
      ].join('\n'),
      inline: false,
    });
  }

  return embed;
}

function buildQuestionComponents(application, questions) {
  const rows = [];

  for (let i = 0; i < questions.length; i += 5) {
    const buttons = questions.slice(i, i + 5).map(question => {
      const answered = Boolean(question.answer?.trim());

      return new ButtonBuilder()
        .setCustomId(
          `staffapp:question:${application.id}:${question.question_number}`
        )
        .setLabel(`Question ${question.question_number}`)
        .setEmoji(answered ? '✅' : '✏️')
        .setStyle(
          answered ? ButtonStyle.Success : ButtonStyle.Secondary
        );
    });

    rows.push(
      new ActionRowBuilder().addComponents(...buttons)
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`staffapp:submit:${application.id}`)
        .setLabel('Submit Application')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📨')
    )
  );

  return rows;
}

function buildReviewComponents(applicationId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`staffapp:decision:select:${applicationId}`)
        .setLabel('Select')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`staffapp:decision:reject:${applicationId}`)
        .setLabel('Reject')
        .setEmoji('✖️')
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

function buildReviewEmbed(
  guild,
  application,
  questions,
  decisionText = 'Pending review'
) {
  const icon = getGuildIcon(guild);

  const embed = new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setAuthor({
      name: guild.name,
      ...(icon ? { iconURL: icon } : {}),
    })
    .setTitle('✦ Staff Application Review')
    .setDescription(
      [
        `**Applicant:** <@${application.user_id}>`,
        `**Application ID:** ${application.app_number}`,
        `**Status:** ${decisionText}`,
        '',
        'Read the applicant’s responses before making a decision.',
      ].join('\n')
    )
    .setFooter({
      text: `STAFF RECRUITMENT • ${guild.name} • APPLICATION #${application.app_number}`,
    });

  for (const question of questions) {
    embed.addFields({
      name: `${question.question_number}. ${question.question_text}`,
      value: question.answer?.trim() || '*No answer provided.*',
      inline: false,
    });
  }

  return embed;
}

// ============================================================
// PERMISSION OVERWRITES
// ============================================================

function addPermissionOverwrite(
  overwriteMap,
  id,
  allow = [],
  deny = []
) {
  const key = String(id);

  if (!overwriteMap.has(key)) {
    overwriteMap.set(key, {
      id: key,
      allow: new Set(),
      deny: new Set(),
    });
  }

  const entry = overwriteMap.get(key);

  for (const permission of allow) {
    entry.deny.delete(permission);
    entry.allow.add(permission);
  }

  for (const permission of deny) {
    entry.allow.delete(permission);
    entry.deny.add(permission);
  }
}

async function buildApplicationOverwrites(
  client,
  guild,
  applicantId
) {
  const overwriteMap = new Map();

  addPermissionOverwrite(
    overwriteMap,
    guild.id,
    [],
    [PermissionFlagsBits.ViewChannel]
  );

  addPermissionOverwrite(
    overwriteMap,
    client.user.id,
    [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ManageChannels,
    ]
  );

  addPermissionOverwrite(
    overwriteMap,
    applicantId,
    [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
    ]
  );

  const reviewers = db.prepare(`
    SELECT target_type, target_id
    FROM staffapp_reviewers
    WHERE guild_id = ?
  `).all(guild.id);

  for (const reviewer of reviewers) {
    addPermissionOverwrite(
      overwriteMap,
      reviewer.target_id,
      [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
      ]
    );
  }

  const botOwnerIds = await refreshBotOwnerIds(client);

  for (const ownerId of botOwnerIds) {
    addPermissionOverwrite(
      overwriteMap,
      ownerId,
      [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
      ]
    );
  }

  return [...overwriteMap.values()].map(entry => ({
    id: entry.id,
    allow: [...entry.allow],
    deny: [...entry.deny],
  }));
}

async function removeApplicantAccess(channel, userId) {
  try {
    // An explicit deny also prevents access through a reviewer role.
    await channel.permissionOverwrites.edit(userId, {
      ViewChannel: false,
      ReadMessageHistory: false,
      SendMessages: false,
    });
  } catch (error) {
    console.error(
      '[StaffApp] Could not remove applicant channel access:',
      error
    );
  }
}

// ============================================================
// ACTIVE REVIEWER PERMISSION UPDATES
// ============================================================

async function refreshReviewerOverwrite(
  client,
  guildId,
  targetType,
  targetId,
  add
) {
  const guild =
    client.guilds.cache.get(guildId) ||
    await client.guilds.fetch(guildId).catch(() => null);

  if (!guild) return;

  const applications = db.prepare(`
    SELECT id, user_id, channel_id
    FROM staffapp_applications
    WHERE guild_id = ?
      AND status IN ('creating', 'in_progress', 'submitted')
      AND channel_id IS NOT NULL
  `).all(guildId);

  const botOwnerIds = await refreshBotOwnerIds(client);

  for (const application of applications) {
    // Don't alter the applicant's own access through a user grant.
    if (
      targetType === 'user' &&
      application.user_id === targetId
    ) {
      continue;
    }

    // Preserve the bot owner's own access if they're also a reviewer.
    if (
      targetType === 'user' &&
      add === false &&
      botOwnerIds.has(targetId)
    ) {
      continue;
    }

    const channel = await client.channels
      .fetch(application.channel_id)
      .catch(() => null);

    if (!channel?.permissionOverwrites) continue;

    try {
      if (add) {
        await channel.permissionOverwrites.edit(targetId, {
          ViewChannel: true,
          ReadMessageHistory: true,
        });
      } else {
        await channel.permissionOverwrites.delete(targetId);
      }
    } catch (error) {
      console.error(
        `[StaffApp] Could not update reviewer access for application ${application.id}:`,
        error.message
      );
    }
  }
}

// ============================================================
// APPLICATION QUESTION MESSAGE REFRESH
// ============================================================

async function refreshApplicationFormMessage(client, applicationId) {
  const application = getApplication(applicationId);

  if (
    !application?.channel_id ||
    !application.application_message_id
  ) {
    return;
  }

  const channel = await client.channels
    .fetch(application.channel_id)
    .catch(() => null);

  if (!channel?.messages) return;

  const message = await channel.messages
    .fetch(application.application_message_id)
    .catch(() => null);

  if (!message) return;

  if (application.status !== 'in_progress') {
    await message.edit({ components: [] }).catch(() => {});
    return;
  }

  const guild =
    client.guilds.cache.get(application.guild_id) ||
    await client.guilds.fetch(application.guild_id).catch(() => null);

  if (!guild) return;

  const questions = getApplicationQuestions(applicationId);

  await message.edit({
    embeds: [
      buildApplicationFormEmbed(guild, application, questions),
    ],
    components: buildQuestionComponents(application, questions),
  }).catch(error => {
    console.error(
      '[StaffApp] Could not refresh application form:',
      error.message
    );
  });
}

// ============================================================
// APPLICATION SUBMISSION ARTIFACTS
// Confirmation is sent first, applicant access removed second,
// and the reviewer embed is sent last.
// This function also repairs incomplete submissions after restart.
// ============================================================

async function ensureSubmittedArtifacts(client, applicationId) {
  let application = getApplication(applicationId);

  if (
    !application ||
    application.status !== 'submitted' ||
    !application.channel_id
  ) {
    return;
  }

  const channel = await client.channels
    .fetch(application.channel_id)
    .catch(() => null);

  if (!channel?.send) return;

  const guild =
    client.guilds.cache.get(application.guild_id) ||
    await client.guilds.fetch(application.guild_id).catch(() => null);

  if (!guild) return;

  // 1. Send the applicant's confirmation embed.
  if (!application.submission_message_id) {
    const confirmation = makeEmbed(
      '✦ Application Submitted',
      [
        'Thank you for applying to join our staff team.',
        '',
        'Your application has been submitted successfully.',
        '',
        'You will be notified via DM if you are selected.',
      ].join('\n'),
      guild
    );

    const confirmationMessage = await channel.send({
      embeds: [confirmation],
    });

    db.prepare(`
      UPDATE staffapp_applications
      SET submission_message_id = ?
      WHERE id = ?
    `).run(confirmationMessage.id, applicationId);
  }

  // 2. Disable the original question buttons.
  await refreshApplicationFormMessage(client, applicationId);

  // 3. Remove the applicant's access before posting review answers.
  await removeApplicantAccess(channel, application.user_id);

  // 4. Send the answer embed and decision buttons.
  application = getApplication(applicationId);

  if (!application.review_message_id) {
    const questions = getApplicationQuestions(applicationId);

    const reviewMessage = await channel.send({
      embeds: [
        buildReviewEmbed(
          guild,
          application,
          questions,
          'Pending review'
        ),
      ],
      components: buildReviewComponents(applicationId),
    });

    db.prepare(`
      UPDATE staffapp_applications
      SET review_message_id = ?
      WHERE id = ?
    `).run(reviewMessage.id, applicationId);
  }
}

// ============================================================
// COOLDOWN AND APPLICATION RESERVATION
// ============================================================

function reserveApplication(
  guildId,
  userId,
  questionRows
) {
  const now = Date.now();

  const transaction = db.transaction(() => {
    const active = db.prepare(`
      SELECT *
      FROM staffapp_applications
      WHERE guild_id = ?
        AND user_id = ?
        AND status IN ('creating', 'in_progress')
      LIMIT 1
    `).get(guildId, userId);

    if (active) {
      return {
        kind: 'active',
        application: active,
      };
    }

    const latestSubmission = db.prepare(`
      SELECT submitted_at
      FROM staffapp_applications
      WHERE guild_id = ?
        AND user_id = ?
        AND submitted_at IS NOT NULL
      ORDER BY submitted_at DESC
      LIMIT 1
    `).get(guildId, userId);

    if (latestSubmission?.submitted_at) {
      const nextEligibleAt = addOneCalendarMonth(
        latestSubmission.submitted_at
      );

      if (now < nextEligibleAt) {
        return {
          kind: 'cooldown',
          nextEligibleAt,
        };
      }
    }

    const config = ensureConfig(guildId);
    const appNumber = config.next_app_number;

    db.prepare(`
      UPDATE staffapp_config
      SET next_app_number = next_app_number + 1
      WHERE guild_id = ?
    `).run(guildId);

    const result = db.prepare(`
      INSERT INTO staffapp_applications (
        guild_id,
        app_number,
        user_id,
        status,
        created_at
      )
      VALUES (?, ?, ?, 'creating', ?)
    `).run(
      guildId,
      appNumber,
      userId,
      now
    );

    const applicationId = Number(result.lastInsertRowid);

    const insertSnapshot = db.prepare(`
      INSERT INTO staffapp_application_questions (
        application_id,
        question_number,
        question_text
      )
      VALUES (?, ?, ?)
    `);

    for (const question of questionRows) {
      insertSnapshot.run(
        applicationId,
        question.question_number,
        question.question_text
      );
    }

    return {
      kind: 'reserved',
      applicationId,
      appNumber,
    };
  });

  return transaction();
}

// ============================================================
// CHANNEL CREATION
// ============================================================

async function createApplicationChannel(
  client,
  interaction,
  applicationId
) {
  const application = getApplication(applicationId);

  if (!application) {
    throw new Error('Application record could not be found.');
  }

  const guild = interaction.guild;
  const config = ensureConfig(guild.id);

  let parentId;

  if (config.panel_channel_id) {
    const panelChannel = await client.channels
      .fetch(config.panel_channel_id)
      .catch(() => null);

    if (panelChannel?.parentId) {
      parentId = panelChannel.parentId;
    }
  }

  const overwrites = await buildApplicationOverwrites(
    client,
    guild,
    application.user_id
  );

  const channel = await guild.channels.create({
    name: `staff-applicant-${application.app_number}`,
    type: ChannelType.GuildText,
    ...(parentId ? { parent: parentId } : {}),
    permissionOverwrites: overwrites,
    topic:
      `Staff application #${application.app_number} | Applicant ID: ${application.user_id}`,
    reason: 'Creating a private staff application channel',
  });

  db.prepare(`
    UPDATE staffapp_applications
    SET channel_id = ?, status = 'in_progress'
    WHERE id = ? AND status = 'creating'
  `).run(channel.id, applicationId);

  try {
    const updatedApplication = getApplication(applicationId);
    const questions = getApplicationQuestions(applicationId);

    const formMessage = await channel.send({
      embeds: [
        buildApplicationFormEmbed(
          guild,
          updatedApplication,
          questions
        ),
      ],
      components: buildQuestionComponents(
        updatedApplication,
        questions
      ),
    });

    db.prepare(`
      UPDATE staffapp_applications
      SET application_message_id = ?
      WHERE id = ?
    `).run(formMessage.id, applicationId);

    return channel;
  } catch (error) {
    db.prepare(`
      UPDATE staffapp_applications
      SET status = 'creation_failed', channel_id = NULL
      WHERE id = ?
    `).run(applicationId);

    await channel.delete(
      'Cleaning up a failed staff application setup'
    ).catch(() => {});

    throw error;
  }
}

// ============================================================
// APPLICATION DELETION SCHEDULER
// The deadline is saved in SQLite so it survives restarts.
// ============================================================

function scheduleChannelDeletion(
  client,
  applicationId,
  deleteAt
) {
  const existingTimer = deletionTimers.get(applicationId);

  if (existingTimer) {
    clearTimeout(existingTimer);
    deletionTimers.delete(applicationId);
  }

  const delay = Math.min(
    Math.max(0, deleteAt - Date.now()),
    2147483647
  );

  const timer = setTimeout(async () => {
    deletionTimers.delete(applicationId);

    const application = getApplication(applicationId);

    if (
      !application ||
      !['selected', 'rejected'].includes(application.status) ||
      !application.delete_at
    ) {
      return;
    }

    if (Date.now() < application.delete_at) {
      scheduleChannelDeletion(
        client,
        applicationId,
        application.delete_at
      );

      return;
    }

    if (application.channel_id) {
      const channel = await client.channels
        .fetch(application.channel_id)
        .catch(() => null);

      if (channel) {
        await channel.delete(
          'Staff application review completed; cleanup timer expired'
        ).catch(error => {
          console.error(
            '[StaffApp] Could not delete reviewed application channel:',
            error.message
          );
        });
      }
    }

    db.prepare(`
      UPDATE staffapp_applications
      SET channel_id = NULL, delete_at = NULL
      WHERE id = ?
    `).run(applicationId);
  }, delay);

  timer.unref?.();

  deletionTimers.set(applicationId, timer);
}

// ============================================================
// DECISION PROCESSING
// ============================================================

async function processDecision(
  client,
  interaction,
  applicationId,
  decision
) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;

  if (!guild) {
    await interaction.editReply({
      embeds: [
        makeEmbed(
          '✦ Staff Applications',
          'This action can only be used inside a server.'
        ),
      ],
    });

    return;
  }

  const authorized = await canReview(
    client,
    guild,
    interaction.member,
    interaction.user.id,
    interaction.memberPermissions
  );

  if (!authorized) {
    await interaction.editReply({
      embeds: [
        makeEmbed(
          '✦ Access Restricted',
          'You are not authorized to review staff applications.',
          guild
        ),
      ],
    });

    return;
  }

  const application = getApplication(applicationId);

  if (
    !application ||
    application.guild_id !== guild.id
  ) {
    await interaction.editReply({
      embeds: [
        makeEmbed(
          '✦ Application Not Found',
          'This application could not be found.',
          guild
        ),
      ],
    });

    return;
  }

  if (application.status !== 'submitted') {
    await interaction.editReply({
      embeds: [
        makeEmbed(
          '✦ Application Already Processed',
          'This application has already been reviewed or is no longer awaiting a decision.',
          guild
        ),
      ],
    });

    return;
  }

  const now = Date.now();
  const deleteAt = now + DELETE_DELAY_MS;

  const newStatus =
    decision === 'select' ? 'selected' : 'rejected';

  // Only one reviewer can successfully change "submitted".
  const update = db.prepare(`
    UPDATE staffapp_applications
    SET
      status = ?,
      decided_at = ?,
      decision_by = ?,
      delete_at = ?
    WHERE id = ? AND status = 'submitted'
  `).run(
    newStatus,
    now,
    interaction.user.id,
    deleteAt,
    applicationId
  );

  if (update.changes === 0) {
    await interaction.editReply({
      embeds: [
        makeEmbed(
          '✦ Application Already Processed',
          'Another reviewer has already made a decision.',
          guild
        ),
      ],
    });

    return;
  }

  scheduleChannelDeletion(client, applicationId, deleteAt);

  const applicant = await client.users
    .fetch(application.user_id)
    .catch(() => null);

  if (applicant) {
    const selected = decision === 'select';

    const dmEmbed = makeEmbed(
      selected
        ? '✦ Staff Application Result'
        : '✦ Staff Application Result',
      selected
        ? [
            `Congratulations! Your staff application for **${guild.name}** has been accepted.`,
            '',
            'A member of the team may contact you with further information.',
          ].join('\n')
        : [
            `Thank you for applying to join the staff team at **${guild.name}**.`,
            '',
            'Unfortunately, your application was not selected this time.',
            '',
            'We appreciate the time you took to apply.',
          ].join('\n'),
      guild
    );

    // A failed DM must not undo the recorded decision.
    await applicant.send({
      embeds: [dmEmbed],
    }).catch(() => {});
  }

  const updatedApplication = getApplication(applicationId);
  const questions = getApplicationQuestions(applicationId);

  try {
    await interaction.message.edit({
      embeds: [
        buildReviewEmbed(
          guild,
          updatedApplication,
          questions,
          decision === 'select'
            ? `Selected by <@${interaction.user.id}>`
            : `Rejected by <@${interaction.user.id}>`
        ),
      ],
      components: [],
    });
  } catch (error) {
    console.error(
      '[StaffApp] Could not update the review message:',
      error.message
    );
  }

  await interaction.editReply({
    embeds: [
      makeEmbed(
        '✦ Decision Recorded',
        [
          `The application has been **${newStatus}**.`,
          '',
          'The applicant has been notified if their DMs were available.',
          '',
          'The application channel is scheduled for deletion in 10 minutes.',
        ].join('\n'),
        guild
      ),
    ],
  });
}

// ============================================================
// APPLY BUTTON
// ============================================================

async function handleApply(client, interaction) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;

  if (!guild) {
    await interaction.editReply({
      embeds: [
        makeEmbed(
          '✦ Staff Applications',
          'Applications can only be started inside a server.'
        ),
      ],
    });

    return;
  }

  const config = ensureConfig(guild.id);

  if (config.setup_confirmed !== 1) {
    await interaction.editReply({
      embeds: [
        makeEmbed(
          '✦ Applications Unavailable',
          'The staff application system has not been configured yet.',
          guild
        ),
      ],
    });

    return;
  }

  const questionRows = getGuildQuestions(guild.id);

  if (questionRows.length === 0) {
    await interaction.editReply({
      embeds: [
        makeEmbed(
          '✦ Applications Unavailable',
          'No application questions have been configured.',
          guild
        ),
      ],
    });

    return;
  }

  let reservation = reserveApplication(
    guild.id,
    interaction.user.id,
    questionRows
  );

  if (reservation.kind === 'active') {
    const active = reservation.application;

    const activeChannel = active.channel_id
      ? await client.channels.fetch(active.channel_id).catch(() => null)
      : null;

    if (activeChannel) {
      await interaction.editReply({
        embeds: [
          makeEmbed(
            '✦ Application Already in Progress',
            [
              'You already have an unfinished staff application.',
              '',
              `Your application channel is ${activeChannel}.`,
              '',
              'Please finish that application before starting another.',
            ].join('\n'),
            guild
          ),
        ],
      });

      return;
    }

    // Recover if an application channel was deleted manually.
    db.prepare(`
      UPDATE staffapp_applications
      SET status = 'cancelled'
      WHERE id = ? AND status = 'in_progress'
    `).run(active.id);

    db.prepare(`
      UPDATE staffapp_applications
      SET status = 'creation_failed'
      WHERE id = ? AND status = 'creating'
    `).run(active.id);

    reservation = reserveApplication(
      guild.id,
      interaction.user.id,
      questionRows
    );
  }

  if (reservation.kind === 'active') {
    await interaction.editReply({
      embeds: [
        makeEmbed(
          '✦ Application Already in Progress',
          'You already have an unfinished application. Please complete it first.',
          guild
        ),
      ],
    });

    return;
  }

  if (reservation.kind === 'cooldown') {
    const timestamp = Math.floor(
      reservation.nextEligibleAt / 1000
    );

    await interaction.editReply({
      embeds: [
        makeEmbed(
          '✦ Application Cooldown',
          [
            'You have already submitted a staff application.',
            '',
            `You can apply again ${`<t:${timestamp}:R>`}.`,
            '',
            `**Next eligible date:** <t:${timestamp}:F>`,
            `**Time remaining:** ${getRemainingTime(reservation.nextEligibleAt)}`,
          ].join('\n'),
          guild
        ).setTimestamp(),
      ],
    });

    return;
  }

  let channel;

  try {
    channel = await createApplicationChannel(
      client,
      interaction,
      reservation.applicationId
    );
  } catch (error) {
    console.error('[StaffApp] Channel creation failed:', error);

    await interaction.editReply({
      embeds: [
        makeEmbed(
          '✦ Could Not Start Application',
          [
            'Nessa could not create your application channel.',
            '',
            'Please contact a server administrator.',
          ].join('\n'),
          guild
        ),
      ],
    });

    return;
  }

  await interaction.editReply({
    embeds: [
      makeEmbed(
        '✦ Application Channel Created',
        [
          'Your private application channel is ready.',
          '',
          `**Channel:** ${channel}`,
          '',
          'Answer every question and submit your application when you are finished.',
        ].join('\n'),
        guild
      ),
    ],
  });
}

// ============================================================
// QUESTION BUTTON
// ============================================================

async function handleQuestionButton(client, interaction, appId, number) {
  const application = getApplication(appId);

  if (
    !application ||
    application.status !== 'in_progress' ||
    application.user_id !== interaction.user.id
  ) {
    await interaction.reply({
      embeds: [
        makeEmbed(
          '✦ Application Unavailable',
          'This application is not available to you.'
        ),
      ],
      ephemeral: true,
    });

    return;
  }

  const question = db.prepare(`
    SELECT *
    FROM staffapp_application_questions
    WHERE application_id = ? AND question_number = ?
  `).get(appId, number);

  if (!question) {
    await interaction.reply({
      embeds: [
        makeEmbed(
          '✦ Question Not Found',
          'This application question could not be found.'
        ),
      ],
      ephemeral: true,
    });

    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`staffapp:answer:${appId}:${number}`)
    .setTitle(`Question ${number}`);

  const input = new TextInputBuilder()
    .setCustomId('answer')
    .setLabel(`Your answer (max ${MAX_ANSWER_LENGTH} characters)`)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(question.question_text.slice(0, 100))
    .setMinLength(1)
    .setMaxLength(MAX_ANSWER_LENGTH)
    .setRequired(true);

  if (question.answer) {
    input.setValue(question.answer.slice(0, MAX_ANSWER_LENGTH));
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  await interaction.showModal(modal);
}

// ============================================================
// MODAL SUBMISSION
// ============================================================

async function handleAnswerModal(
  client,
  interaction,
  appId,
  number
) {
  await interaction.deferReply({ ephemeral: true });

  const application = getApplication(appId);

  if (
    !application ||
    application.status !== 'in_progress' ||
    application.user_id !== interaction.user.id
  ) {
    await interaction.editReply({
      embeds: [
        makeEmbed(
          '✦ Application Unavailable',
          'This application is no longer available to you.'
        ),
      ],
    });

    return;
  }

  const question = db.prepare(`
    SELECT question_number
    FROM staffapp_application_questions
    WHERE application_id = ? AND question_number = ?
  `).get(appId, number);

  if (!question) {
    await interaction.editReply({
      embeds: [
        makeEmbed(
          '✦ Question Not Found',
          'This question could not be found.'
        ),
      ],
    });

    return;
  }

  const answer = interaction.fields
    .getTextInputValue('answer')
    .trim()
    .slice(0, MAX_ANSWER_LENGTH);

  if (!answer) {
    await interaction.editReply({
      embeds: [
        makeEmbed(
          '✦ Answer Required',
          'Please enter an answer before saving.'
        ),
      ],
    });

    return;
  }

  db.prepare(`
    UPDATE staffapp_application_questions
    SET answer = ?, answered_at = ?
    WHERE application_id = ? AND question_number = ?
  `).run(
    answer,
    Date.now(),
    appId,
    number
  );

  await refreshApplicationFormMessage(client, appId);

  await interaction.editReply({
    embeds: [
      makeEmbed(
        '✦ Answer Saved',
        [
          `Your answer to **Question ${number}** has been saved.`,
          '',
          'You can reopen the question to edit it before submitting.',
        ].join('\n')
      ),
    ],
  });
}

// ============================================================
// SUBMIT APPLICATION
// ============================================================

async function handleSubmitButton(client, interaction, appId) {
  await interaction.deferReply({ ephemeral: true });

  const application = getApplication(appId);

  if (
    !application ||
    application.status !== 'in_progress' ||
    application.user_id !== interaction.user.id
  ) {
    await interaction.editReply({
      embeds: [
        makeEmbed(
          '✦ Application Unavailable',
          'This application has already been submitted or is no longer available.'
        ),
      ],
    });

    return;
  }

  const questions = getApplicationQuestions(appId);

  const unanswered = questions.filter(
    question => !question.answer?.trim()
  );

  if (unanswered.length > 0) {
    await interaction.editReply({
      embeds: [
        makeEmbed(
          '✦ Incomplete Application',
          [
            'Please answer every question before submitting.',
            '',
            `**Unanswered questions:** ${unanswered
              .map(question => question.question_number)
              .join(', ')}`,
          ].join('\n')
        ),
      ],
    });

    return;
  }

  const submittedAt = Date.now();

  const update = db.prepare(`
    UPDATE staffapp_applications
    SET status = 'submitted', submitted_at = ?
    WHERE id = ? AND status = 'in_progress'
  `).run(submittedAt, appId);

  if (update.changes === 0) {
    await interaction.editReply({
      embeds: [
        makeEmbed(
          '✦ Application Already Submitted',
          'This application has already been submitted.'
        ),
      ],
    });

    return;
  }

  try {
    await ensureSubmittedArtifacts(client, appId);
  } catch (error) {
    // Startup recovery will repair missing messages if a restart occurs.
    console.error(
      '[StaffApp] Could not finish submission messages:',
      error
    );
  }

  await interaction.editReply({
    embeds: [
      makeEmbed(
        '✦ Application Submitted',
        [
          'Your application has been submitted successfully.',
          '',
          'Thank you for your interest in joining the staff team.',
        ].join('\n'),
        interaction.guild
      ),
    ],
  });
}

// ============================================================
// RESTORE SUBMITTED APPLICATIONS AFTER RESTART
// ============================================================

async function recoverSubmittedApplications(client) {
  const submitted = db.prepare(`
    SELECT id
    FROM staffapp_applications
    WHERE status = 'submitted'
      AND channel_id IS NOT NULL
  `).all();

  for (const row of submitted) {
    try {
      await ensureSubmittedArtifacts(client, row.id);
    } catch (error) {
      console.error(
        `[StaffApp] Could not recover application ${row.id}:`,
        error.message
      );
    }
  }
}

// ============================================================
// STARTUP INITIALIZATION
// ============================================================

async function init(client) {
  client.staffAppDB = db;

  await refreshBotOwnerIds(client);

  // A restart during channel creation must not permanently block applying.
  db.prepare(`
    UPDATE staffapp_applications
    SET status = 'creation_failed'
    WHERE status = 'creating'
  `).run();

  await recoverSubmittedApplications(client);

  // Restore scheduled deletion deadlines.
  const pendingDeletion = db.prepare(`
    SELECT id, delete_at
    FROM staffapp_applications
    WHERE status IN ('selected', 'rejected')
      AND delete_at IS NOT NULL
  `).all();

  for (const application of pendingDeletion) {
    scheduleChannelDeletion(
      client,
      application.id,
      application.delete_at
    );
  }

  console.log('[StaffApp] Initialized and persistent state loaded.');
}

// ============================================================
// REVIEW TARGET RESOLUTION
// ============================================================

async function resolveReviewerTarget(
  client,
  message,
  input
) {
  const guild = message.guild;

  if (!input) return null;

  const cleanInput = String(input).trim();

  // Explicit role mention.
  const roleMention = cleanInput.match(/^<@&(\d+)>$/);

  // Explicit user mention.
  const userMention = cleanInput.match(/^<@!?(\d+)>$/);

  let id = roleMention?.[1] || userMention?.[1] || null;

  // A plain snowflake may be either a role ID or user ID.
  if (!id && /^\d{15,20}$/.test(cleanInput)) {
    id = cleanInput;
  }

  if (roleMention || (/^\d{15,20}$/.test(cleanInput) && !userMention)) {
    const role = await guild.roles.fetch(id).catch(() => null);

    if (role && role.id !== guild.id) {
      return {
        type: 'role',
        id: role.id,
        name: role.name,
      };
    }
  }

  if (userMention || id) {
    const member = await guild.members
      .fetch(id)
      .catch(() => null);

    if (member) {
      return {
        type: 'user',
        id: member.id,
        name: member.user.tag,
      };
    }

    return null;
  }

  // Allow an exact role name.
  const role = guild.roles.cache.find(
    item =>
      item.name.toLowerCase() === cleanInput.toLowerCase() &&
      item.id !== guild.id
  );

  if (role) {
    return {
      type: 'role',
      id: role.id,
      name: role.name,
    };
  }

  // Allow a username or member name using your existing helper.
  let member = await universalHelper.resolveMember(
    client,
    message,
    cleanInput
  );

  if (!member) {
    await guild.members.fetch().catch(() => null);

    member = guild.members.cache.find(
      item =>
        item.displayName.toLowerCase() === cleanInput.toLowerCase()
    );
  }

  if (member) {
    return {
      type: 'user',
      id: member.id,
      name: member.user.tag,
    };
  }

  return null;
}

// ============================================================
// COMMAND HELP
// ============================================================

function buildHelpEmbed(guild, prefix) {
  return makeEmbed(
    '✦ Staff Application Commands',
    [
      `\`${prefix}staffapp question <1-10> <question>\``,
      'Adds or replaces a question while setup is inactive.',
      '',
      `\`${prefix}staffapp confirm setup\``,
      'Activates the configured questions.',
      '',
      `\`${prefix}staffapp setup reset\``,
      'Clears the configured questions and disables new applications.',
      '',
      `\`${prefix}staffapp channel #channel\``,
      'Sends or updates the recruitment panel.',
      '',
      `\`${prefix}staffapp review add <user/role>\``,
      'Authorizes a reviewer.',
      '',
      `\`${prefix}staffapp review remove <user/role>\``,
      'Removes a review authorization.',
    ].join('\n'),
    guild
  );
}

// ============================================================
// MAIN MESSAGE COMMAND
// ============================================================

async function execute(client, message, args) {
  if (!message.guild) {
    await message.reply('This command can only be used inside a server.');
    return;
  }

  const guild = message.guild;
  const guildId = guild.id;
  const subcommand = String(args[0] || '').toLowerCase();

  if (!subcommand || subcommand === 'help') {
    await message.reply({
      embeds: [
        buildHelpEmbed(
          guild,
          message.prefix || client.getPrefix(guildId) || '$'
        ),
      ],
    });

    return;
  }

  const authorized = await canManageSetup(
    client,
    guild,
    message.member,
    message.author.id
  );

  if (!authorized) {
    await message.reply({
      embeds: [
        makeEmbed(
          '✦ Access Restricted',
          'Only administrators, the server owner, and the bot owner can configure staff applications.',
          guild
        ),
      ],
    });

    return;
  }

  ensureConfig(guildId);

  // ----------------------------------------------------------
  // staffapp question <number> <question>
  // ----------------------------------------------------------

  if (subcommand === 'question') {
    const number = Number(args[1]);
    const questionText = args.slice(2).join(' ').trim();

    const config = ensureConfig(guildId);

    if (config.setup_confirmed === 1) {
      await message.reply({
        embeds: [
          makeEmbed(
            '✦ Setup Already Confirmed',
            'Use `staffapp setup reset` before changing the questions.',
            guild
          ),
        ],
      });

      return;
    }

    if (
      !Number.isInteger(number) ||
      number < 1 ||
      number > MAX_QUESTIONS
    ) {
      await message.reply({
        embeds: [
          makeEmbed(
            '✦ Invalid Question Number',
            `Choose a question number from 1 to ${MAX_QUESTIONS}.`,
            guild
          ),
        ],
      });

      return;
    }

    if (!questionText) {
      await message.reply({
        embeds: [
          makeEmbed(
            '✦ Question Required',
            `Usage: \`${message.prefix}staffapp question ${number} Your question here\``,
            guild
          ),
        ],
      });

      return;
    }

    if (questionText.length > MAX_QUESTION_LENGTH) {
      await message.reply({
        embeds: [
          makeEmbed(
            '✦ Question Too Long',
            `Questions must be ${MAX_QUESTION_LENGTH} characters or fewer.`,
            guild
          ),
        ],
      });

      return;
    }

    db.prepare(`
      INSERT INTO staffapp_questions (
        guild_id,
        question_number,
        question_text
      )
      VALUES (?, ?, ?)
      ON CONFLICT(guild_id, question_number)
      DO UPDATE SET question_text = excluded.question_text
    `).run(
      guildId,
      number,
      questionText
    );

    await message.reply({
      embeds: [
        makeEmbed(
          '✦ Question Saved',
          [
            `**Question ${number}** has been saved.`,
            '',
            questionText,
            '',
            'Add the remaining questions, then run `staffapp confirm setup`.',
          ].join('\n'),
          guild
        ),
      ],
    });

    return;
  }

  // ----------------------------------------------------------
  // staffapp confirm setup
  // ----------------------------------------------------------

  if (
    subcommand === 'confirm' &&
    String(args[1] || '').toLowerCase() === 'setup'
  ) {
    const questions = getGuildQuestions(guildId);

    if (questions.length === 0) {
      await message.reply({
        embeds: [
          makeEmbed(
            '✦ No Questions Configured',
            'Add at least one question before confirming setup.',
            guild
          ),
        ],
      });

      return;
    }

    const expectedNumbers = Array.from(
      { length: questions.length },
      (_, index) => index + 1
    );

    const numbersMatch = questions.every(
      (question, index) =>
        question.question_number === expectedNumbers[index]
    );

    if (!numbersMatch) {
      await message.reply({
        embeds: [
          makeEmbed(
            '✦ Question Numbers Have Gaps',
            [
              'Questions must be numbered consecutively from 1.',
              '',
              `Configured numbers: ${questions
                .map(question => question.question_number)
                .join(', ')}`,
              '',
              'Fill in the missing question numbers before confirming.',
            ].join('\n'),
            guild
          ),
        ],
      });

      return;
    }

    db.prepare(`
      UPDATE staffapp_config
      SET setup_confirmed = 1
      WHERE guild_id = ?
    `).run(guildId);

    await updateSavedPanel(client, guildId);

    await message.reply({
      embeds: [
        makeEmbed(
          '✦ Staff Applications Activated',
          [
            'The application setup has been confirmed.',
            '',
            `**Questions configured:** ${questions.length}/${MAX_QUESTIONS}`,
            '',
            'New applicants can now use the Apply button.',
          ].join('\n'),
          guild
        ),
      ],
    });

    return;
  }

  // ----------------------------------------------------------
  // staffapp setup reset
  // ----------------------------------------------------------

  if (
    subcommand === 'setup' &&
    String(args[1] || '').toLowerCase() === 'reset'
  ) {
    const resetTransaction = db.transaction(() => {
      db.prepare(`
        UPDATE staffapp_config
        SET setup_confirmed = 0
        WHERE guild_id = ?
      `).run(guildId);

      db.prepare(`
        DELETE FROM staffapp_questions
        WHERE guild_id = ?
      `).run(guildId);
    });

    resetTransaction();

    await updateSavedPanel(client, guildId);

    await message.reply({
      embeds: [
        makeEmbed(
          '✦ Staff Application Setup Reset',
          [
            'The configured questions have been cleared.',
            'The recruitment panel has been disabled.',
            '',
            'Existing application records, cooldowns, reviewer permissions, and permanent numbering have been preserved.',
            '',
            'Add the new questions and run `staffapp confirm setup` when finished.',
          ].join('\n'),
          guild
        ),
      ],
    });

    return;
  }

  // ----------------------------------------------------------
  // staffapp channel #channel / channel ID
  // ----------------------------------------------------------

  if (subcommand === 'channel') {
    const targetInput = args.slice(1).join(' ').trim();

    let targetChannel = message.mentions.channels.first();

    if (!targetChannel && targetInput) {
      const idMatch = targetInput.match(
        /^(?:<#)?(\d{15,20})>?$/
      );

      if (idMatch) {
        targetChannel = await guild.channels
          .fetch(idMatch[1])
          .catch(() => null);
      }
    }

    if (
      !targetChannel ||
      targetChannel.guildId !== guildId ||
      !targetChannel.isTextBased() ||
      typeof targetChannel.send !== 'function' ||
      !targetChannel.messages
    ) {
      await message.reply({
        embeds: [
          makeEmbed(
            '✦ Invalid Channel',
            `Usage: \`${message.prefix}staffapp channel #applications\``,
            guild
          ),
        ],
      });

      return;
    }

    const config = ensureConfig(guildId);

    let savedMessage = null;

    if (
      config.panel_channel_id &&
      config.panel_message_id
    ) {
      const previousChannel = await client.channels
        .fetch(config.panel_channel_id)
        .catch(() => null);

      if (previousChannel?.messages) {
        savedMessage = await previousChannel.messages
          .fetch(config.panel_message_id)
          .catch(() => null);
      }
    }

    let panelMessage;

    if (savedMessage && config.panel_channel_id === targetChannel.id) {
      panelMessage = await savedMessage.edit({
        embeds: [buildRecruitmentEmbed(guild)],
        components: buildPanelComponents(
          config.setup_confirmed === 1
        ),
      });
    } else {
      if (savedMessage) {
        await savedMessage.delete().catch(() => {});
      }

      panelMessage = await targetChannel.send({
        embeds: [buildRecruitmentEmbed(guild)],
        components: buildPanelComponents(
          config.setup_confirmed === 1
        ),
      });
    }

    db.prepare(`
      UPDATE staffapp_config
      SET panel_channel_id = ?, panel_message_id = ?
      WHERE guild_id = ?
    `).run(
      targetChannel.id,
      panelMessage.id,
      guildId
    );

    await message.reply({
      embeds: [
        makeEmbed(
          '✦ Recruitment Panel Saved',
          [
            `The staff application panel is now in ${targetChannel}.`,
            '',
            config.setup_confirmed === 1
              ? 'The Apply button is enabled.'
              : 'The Apply button will become available after setup is confirmed.',
          ].join('\n'),
          guild
        ),
      ],
    });

    return;
  }

  // ----------------------------------------------------------
  // staffapp review add/remove <user/role>
  // ----------------------------------------------------------

  if (subcommand === 'review') {
    const action = String(args[1] || '').toLowerCase();

    if (!['add', 'remove'].includes(action)) {
      await message.reply({
        embeds: [
          makeEmbed(
            '✦ Reviewer Command',
            [
              `\`${message.prefix}staffapp review add @user\``,
              `\`${message.prefix}staffapp review add @role\``,
              '',
              `\`${message.prefix}staffapp review remove @user\``,
              `\`${message.prefix}staffapp review remove @role\``,
            ].join('\n'),
            guild
          ),
        ],
      });

      return;
    }

    const targetInput = args.slice(2).join(' ').trim();

    const target = await resolveReviewerTarget(
      client,
      message,
      targetInput
    );

    if (!target) {
      await message.reply({
        embeds: [
          makeEmbed(
            '✦ Reviewer Not Found',
            [
              'Mention a server member or role, or provide its ID or name.',
              '',
              'Example: `staffapp review add @Moderator`',
            ].join('\n'),
            guild
          ),
        ],
      });

      return;
    }

    let changed;

    if (action === 'add') {
      changed = db.prepare(`
        INSERT OR IGNORE INTO staffapp_reviewers (
          guild_id, target_type, target_id
        )
        VALUES (?, ?, ?)
      `).run(
        guildId,
        target.type,
        target.id
      ).changes;
    } else {
      changed = db.prepare(`
        DELETE FROM staffapp_reviewers
        WHERE guild_id = ?
          AND target_type = ?
          AND target_id = ?
      `).run(
        guildId,
        target.type,
        target.id
      ).changes;
    }

    if (changed > 0) {
      await refreshReviewerOverwrite(
        client,
        guildId,
        target.type,
        target.id,
        action === 'add'
      );
    }

    const actionText =
      action === 'add' ? 'authorized' : 'removed from the reviewer list';

    await message.reply({
      embeds: [
        makeEmbed(
          changed > 0
            ? '✦ Reviewer Permissions Updated'
            : '✦ No Changes Needed',
          changed > 0
            ? `**${target.name}** has been ${actionText}.`
            : action === 'add'
              ? `**${target.name}** was already authorized to review applications.`
              : `**${target.name}** was not on the reviewer list.`,
          guild
        ),
      ],
    });

    return;
  }

  // ----------------------------------------------------------
  // Unknown subcommand
  // ----------------------------------------------------------

  await message.reply({
    embeds: [
      buildHelpEmbed(
        guild,
        message.prefix || client.getPrefix(guildId) || '$'
      ),
    ],
  });
}

// ============================================================
// INTERACTION ROUTER
// Called from index.js for staffapp buttons and modals.
// ============================================================

async function handleInteraction(client, interaction) {
  const customId = interaction.customId;

  if (
    typeof customId !== 'string' ||
    !customId.startsWith('staffapp:')
  ) {
    return;
  }

  try {
    if (interaction.isButton()) {
      if (customId === 'staffapp:apply') {
        await handleApply(client, interaction);
        return;
      }

      const parts = customId.split(':');

      if (parts[1] === 'question') {
        await handleQuestionButton(
          client,
          interaction,
          Number(parts[2]),
          Number(parts[3])
        );

        return;
      }

      if (parts[1] === 'submit') {
        await handleSubmitButton(
          client,
          interaction,
          Number(parts[2])
        );

        return;
      }

      if (parts[1] === 'decision') {
        await processDecision(
          client,
          interaction,
          Number(parts[3]),
          parts[2]
        );

        return;
      }
    }

    if (interaction.isModalSubmit()) {
      const parts = customId.split(':');

      if (parts[1] === 'answer') {
        await handleAnswerModal(
          client,
          interaction,
          Number(parts[2]),
          Number(parts[3])
        );
      }
    }
  } catch (error) {
    console.error('[StaffApp] Interaction failed:', error);

    const errorEmbed = makeEmbed(
      '✦ Something Went Wrong',
      'Nessa could not complete that action. Please try again or contact an administrator.'
    );

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        embeds: [errorEmbed],
      }).catch(() => {});
    } else {
      await interaction.reply({
        embeds: [errorEmbed],
        ephemeral: true,
      }).catch(() => {});
    }
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  name: 'staffapp',
  category: 'Moderation',
  description: 'Configure and manage staff applications.',
  usage: 'staffapp <question|confirm|setup|channel|review|help>',
  aliases: [],

  execute,
  init,
  handleInteraction,
};