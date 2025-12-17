const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const { prefix } = require('../config');

function loadCommands(client) {
  client.commands = new Collection();       // main commands only
  client.aliases = new Collection();       // alias -> main command
  client.brokenCommands = [];

  const commandsPath = path.join(__dirname, '..', 'commands');
  if (!fs.existsSync(commandsPath)) return console.warn('No commands folder found.');

  const categories = fs.readdirSync(commandsPath);

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    let stat;
    try { stat = fs.statSync(categoryPath); } catch { continue; }

    if (stat.isFile() && category.endsWith('.js')) {
      const filePath = categoryPath;
      try { registerCommand(client, require(filePath), filePath); } 
      catch (err) { client.brokenCommands.push({ file: filePath, error: err.stack || String(err) }); }
      continue;
    }

    if (!stat.isDirectory()) continue;

    const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const filePath = path.join(categoryPath, file);
      try { registerCommand(client, require(filePath), filePath); } 
      catch (err) { client.brokenCommands.push({ file: filePath, error: err.stack || String(err) }); }
    }
  }

  console.log(`Loaded ${client.commands.size} commands. Broken: ${client.brokenCommands.length}`);
}

function registerCommand(client, command, filePath = 'unknown') {
  if (!command || typeof command !== 'object') throw new Error(`Invalid command export in ${filePath}`);
  if (!command.name || typeof command.name !== 'string') throw new Error(`Missing name in ${filePath}`);
  if (typeof command.execute !== 'function') throw new Error(`Missing execute() in ${command.name}`);

  // Fill defaults
  if (!command.description) command.description = 'No description.';
  if (!command.usage) command.usage = '';
  if (!command.category) command.category = 'Misc';
  if (!Array.isArray(command.aliases)) command.aliases = [];

  // store main command
  client.commands.set(command.name.toLowerCase(), command);

  // store aliases
  for (const a of command.aliases) {
    if (!client.aliases.has(a.toLowerCase())) {
      client.aliases.set(a.toLowerCase(), command);
    }
  }

  console.log(`Loaded command: ${command.name} (${command.category})`);
}

async function handleMessage(client, message) {
  if (message.author.bot) return;
  const content = message.content?.trim();
  if (!content) return;

  // AFK clearing / mentions
  if (client.afk?.has(message.author.id)) {
    client.afk.delete(message.author.id);
    try { await message.reply(`Welcome back, <@${message.author.id}>. I removed your AFK status.`); } catch {}
  }
  if (message.mentions.users.size > 0 && client.afk) {
    for (const [, user] of message.mentions.users) {
      const data = client.afk.get(user.id);
      if (data) try {
        await message.reply(`<@${user.id}> is AFK: **${data.reason}** (since <t:${Math.floor(data.since / 1000)}:R>)`);
      } catch {}
    }
  }

  // PREFIXLESS
  if (client.prefixless && client.prefixless.has(message.author.id)) {
    const parts = content.split(/\s+/);
    const cmdName = parts[0].toLowerCase();
    const cmd = client.commands.get(cmdName) || client.aliases.get(cmdName);
    if (cmd) {
      const args = parts.slice(1);
      try { await cmd.execute(client, message, args); } catch (err) {
        console.error(`Prefixless error: ${cmdName}`, err);
        try { await message.reply('Something went wrong while executing that command.'); } catch {}
      }
      return;
    }
  }

  // PREFIXED
  if (!content.startsWith(prefix)) return;
  const args = content.slice(prefix.length).trim().split(/\s+/);
  const cmdName = args.shift()?.toLowerCase();
  if (!cmdName) return;

  const cmd = client.commands.get(cmdName) || client.aliases.get(cmdName);
  if (!cmd) return;

  try { await cmd.execute(client, message, args); } catch (err) {
    console.error(`Command execution error (${cmdName}):`, err);
    try { await message.reply('Something went wrong while executing that command.'); } catch {}
  }
}

module.exports = { loadCommands, handleMessage };