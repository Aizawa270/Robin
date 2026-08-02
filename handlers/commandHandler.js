const universalHelper = require('./universalHelper');
const fs = require('fs');
const path = require('path');
const { Collection, EmbedBuilder } = require('discord.js');

// ============================================================
// STRIP REPLIED-TO USER FROM MENTIONS
// Prevents reply mentions from being treated as normal mentions
// ============================================================

function stripReplyMentions(message) {
  if (!message.reference) return;

  const repliedUserId = message.mentions?.repliedUser?.id;
  if (!repliedUserId) return;

  message.mentions.users.delete(repliedUserId);
  message.mentions.members?.delete(repliedUserId);
}

// ============================================================
// LOAD ALL COMMANDS
// ============================================================

function loadCommands(client) {
  client.commands = new Collection();
  client.aliases = new Collection();
  client.brokenCommands = [];

  const commandsPath = path.join(__dirname, '..', 'commands');

  if (!fs.existsSync(commandsPath)) {
    console.warn(`[Commands] Commands folder not found: ${commandsPath}`);
    return;
  }

  const entries = fs.readdirSync(commandsPath).sort();

  for (const entry of entries) {
    const entryPath = path.join(commandsPath, entry);

    let stat;

    try {
      stat = fs.statSync(entryPath);
    } catch (error) {
      console.error(`[Commands] Could not inspect: ${entryPath}`, error);
      continue;
    }

    if (stat.isFile() && entry.endsWith('.js')) {
      try {
        const command = require(entryPath);
        registerCommand(client, command, entryPath);
      } catch (error) {
        client.brokenCommands.push({
          file: entryPath,
          error,
        });
      }

      continue;
    }

    if (!stat.isDirectory()) continue;

    let files;

    try {
      files = fs.readdirSync(entryPath).filter(file => file.endsWith('.js')).sort();
    } catch (error) {
      console.error(`[Commands] Could not read category: ${entryPath}`, error);
      continue;
    }

    for (const file of files) {
      const filePath = path.join(entryPath, file);

      try {
        const command = require(filePath);
        registerCommand(client, command, filePath);
      } catch (error) {
        client.brokenCommands.push({
          file: filePath,
          error,
        });
      }
    }
  }

  console.log(`✅ Loaded ${client.commands.size} commands`);

  if (client.aliases.size > 0) {
    console.log(`🔗 Loaded ${client.aliases.size} aliases`);
  }

  if (client.brokenCommands.length > 0) {
    console.error(`❌ ${client.brokenCommands.length} command(s) failed to load:`);

    for (const broken of client.brokenCommands) {
      console.error(`\n[Broken Command] ${broken.file}`);
      console.error(
        broken.error?.stack ||
        broken.error?.message ||
        broken.error
      );
    }
  }
}

// ============================================================
// REGISTER COMMAND
// ============================================================

function registerCommand(client, command, filePath) {
  if (!command?.name || typeof command.execute !== 'function') {
    console.warn(`[Commands] Skipping invalid command: ${filePath}`);
    return;
  }

  command.aliases ??= [];
  command.category ??= 'Misc';
  command.usage ??= '';
  command.description ??= 'No description';

  const commandName = String(command.name).toLowerCase().trim();

  if (client.commands.has(commandName)) {
    console.error(`[Commands] Duplicate command name "${commandName}" in ${filePath}`);
    return;
  }

  client.commands.set(commandName, command);

  for (const alias of command.aliases) {
    if (!alias) continue;

    const aliasName = String(alias).toLowerCase().trim();
    if (!aliasName) continue;

    if (client.commands.has(aliasName)) {
      console.error(
        `[Commands] Alias "${aliasName}" in ${filePath} conflicts with command "${aliasName}". Skipping alias.`
      );
      continue;
    }

    if (client.aliases.has(aliasName)) {
      const existingCommand = client.aliases.get(aliasName);
      console.error(
        `[Commands] Duplicate alias "${aliasName}" in ${filePath}. Already used by "${existingCommand.name}". Skipping alias.`
      );
      continue;
    }

    client.aliases.set(aliasName, command);
  }
}

// ============================================================
// GET CURRENT PREFIX
// ============================================================

function getCurrentPrefix(client, guildId) {
  return client.getPrefix(guildId) || '$';
}

// ============================================================
// BOT BLACKLIST CHECK
// ============================================================

async function checkBotBlacklist(client, message) {
  if (!client.botBlacklist?.has(message.author.id)) {
    return false;
  }

  const embed = new EmbedBuilder()
    .setColor('#ff0000')
    .setAuthor({ name: 'Vanessa' })
    .setDescription("You're restricted from using Vanessa.")
    .setFooter({
      text: 'Contact the server owner if you think this is a mistake.',
    });

  await message.reply({ embeds: [embed] }).catch(() => {});
  return true;
}

// ============================================================
// PREPARE MESSAGE FOR COMMAND
// ============================================================

function prepareMessage(client, message, command) {
  const prefix = getCurrentPrefix(client, message.guild?.id);

  message.prefix = prefix;
  message.commandName = command.name;

  message.createEmbed = (opts) => universalHelper.createEmbed(client, message, opts);

  message.resolveUser = (input) => universalHelper.resolveUser(client, message, input);
  message.resolveMember = (input) => universalHelper.resolveMember(client, message, input);

  universalHelper.patchMessageReply(message);
}

// ============================================================
// EXECUTE COMMAND SAFELY
// ============================================================

async function executeCommand(client, message, command, args) {
  prepareMessage(client, message, command);

  try {
    await command.execute(client, message, args);
  } catch (error) {
    console.error(`[Command Error] ${command.name}`, error);

    await message.reply('Something went wrong while running that command.').catch(() => {});
  }
}

// ============================================================
// HANDLE MESSAGE
// ============================================================

async function handleMessage(client, message) {
  if (message.author.bot) return;

  stripReplyMentions(message);

  const content = message.content?.trim();
  if (!content) return;

  const prefix = getCurrentPrefix(client, message.guild?.id);
  const isPrefixed = content.startsWith(prefix);

  const isPrefixless =
    message.guild &&
    !isPrefixed &&
    (
      typeof client.isPrefixless === 'function'
        ? client.isPrefixless(message.guild.id, message.author.id)
        : client.prefixless?.has(message.author.id)
    );

  if (isPrefixless) {
    const parts = content.split(/\s+/);
    const cmdName = parts.shift()?.toLowerCase();
    if (!cmdName) return;

    const command = client.commands.get(cmdName) || client.aliases.get(cmdName);
    if (!command) return;

    if (await checkBotBlacklist(client, message)) return;

    await executeCommand(client, message, command, parts);
    return;
  }

  if (!isPrefixed) return;

  const commandText = content.slice(prefix.length).trim();
  if (!commandText) return;

  const args = commandText.split(/\s+/);
  const cmdName = args.shift()?.toLowerCase();
  if (!cmdName) return;

  const command = client.commands.get(cmdName) || client.aliases.get(cmdName);
  if (!command) return;

  if (await checkBotBlacklist(client, message)) return;

  await executeCommand(client, message, command, args);
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  loadCommands,
  handleMessage,
};