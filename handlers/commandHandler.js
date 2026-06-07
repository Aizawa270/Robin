const universalHelper = require('./universalHelper');
const fs = require('fs');
const path = require('path');
const { Collection, EmbedBuilder } = require('discord.js');

function stripReplyMentions(message) {
  if (!message.reference) return;
  const repliedUserId = message.mentions?.repliedUser?.id;
  if (!repliedUserId) return;
  message.mentions.users.delete(repliedUserId);
  message.mentions.members?.delete(repliedUserId);
}

function loadCommands(client) {
  client.commands = new Collection();
  client.aliases = new Collection();
  client.brokenCommands = [];

  const commandsPath = path.join(__dirname, '..', 'commands');
  if (!fs.existsSync(commandsPath)) return;

  const categories = fs.readdirSync(commandsPath);

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    let stat;
    try { stat = fs.statSync(categoryPath); } catch { continue; }

    if (stat.isFile() && category.endsWith('.js')) {
      try { registerCommand(client, require(categoryPath)); }
      catch (e) { client.brokenCommands.push({ file: categoryPath, error: e }); }
      continue;
    }

    if (!stat.isDirectory()) continue;

    const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const filePath = path.join(categoryPath, file);
      try { registerCommand(client, require(filePath)); }
      catch (e) { client.brokenCommands.push({ file: filePath, error: e }); }
    }
  }

  console.log(`✅ Loaded ${client.commands.size} commands`);
}

function registerCommand(client, command) {
  if (!command?.name || typeof command.execute !== 'function') return;

  command.aliases ??= [];
  command.category ??= 'Misc';
  command.usage ??= '';
  command.description ??= 'No description';

  client.commands.set(command.name.toLowerCase(), command);
  for (const a of command.aliases) {
    if (!client.aliases.has(a.toLowerCase())) {
      client.aliases.set(a.toLowerCase(), command);
    }
  }
}

function getCurrentPrefix(client, guildId) {
  return client.getPrefix(guildId) || '!';
}

async function checkBotBlacklist(client, message) {
  if (!client.botBlacklist?.has(message.author.id)) return false;

  const embed = new EmbedBuilder()
    .setColor('#ff0000')
    .setAuthor({ name: 'Vanessa' })
    .setDescription("You're restricted from using Vanessa.")
    .setFooter({ text: 'Contact the server owner if you think this is a mistake.' });

  await message.reply({ embeds: [embed] }).catch(() => {});
  return true;
}

async function handleMessage(client, message) {
  if (message.author.bot) return;

  stripReplyMentions(message);

  const content = message.content?.trim();
  if (!content) return;

  // NOTE: AFK logic is handled entirely in afk.js handleMessage — do NOT add it here

  const prefix = getCurrentPrefix(client, message.guild?.id);
  const isPrefixed = content.startsWith(prefix);

  /* ===== PREFIXLESS ===== */
  if (!isPrefixed && client.prefixless?.has(message.author.id)) {
    const parts = content.split(/\s+/);
    const cmdName = parts.shift().toLowerCase();
    const cmd = client.commands.get(cmdName) || client.aliases.get(cmdName);
    if (!cmd) return;

    if (await checkBotBlacklist(client, message)) return;

    message.prefix = prefix;
    message.commandName = cmd.name;
    message.createEmbed = (opts) =>
      universalHelper.createEmbed(client, message, opts);
    universalHelper.patchMessageReply(message);

    try {
      await cmd.execute(client, message, parts);
    } catch (e) {
      console.error(e);
      message.reply('Something went wrong.');
    }
    return;
  }

  /* ===== PREFIXED ===== */
  if (!isPrefixed) return;

  const args = content.slice(prefix.length).trim().split(/\s+/);
  const cmdName = args.shift()?.toLowerCase();
  if (!cmdName) return;

  const cmd = client.commands.get(cmdName) || client.aliases.get(cmdName);
  if (!cmd) return;

  if (await checkBotBlacklist(client, message)) return;

  message.prefix = prefix;
  message.commandName = cmd.name;
  message.createEmbed = (opts) =>
    universalHelper.createEmbed(client, message, opts);
  universalHelper.patchMessageReply(message);

  try {
    await cmd.execute(client, message, args);
  } catch (e) {
    console.error(e);
    message.reply('Something went wrong.');
  }
}

module.exports = { loadCommands, handleMessage };