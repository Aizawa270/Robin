const Database = require('better-sqlite3');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'automod.sqlite'));

// ===== TABLES =====
db.prepare(`CREATE TABLE IF NOT EXISTS automod_alert (guild_id TEXT PRIMARY KEY, channel_id TEXT)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS automod_alert_users (guild_id TEXT, user_id TEXT)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS automod_alert_roles (guild_id TEXT, role_id TEXT)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS blacklist_words (guild_id TEXT, word TEXT, type TEXT)`).run(); // type: 'soft' or 'trigger'

// ===== FUNCTIONS =====
function checkMessage(client, message) {
    if (!message.guild || message.author.bot) return;

    const row = db.prepare('SELECT * FROM blacklist_words WHERE guild_id = ?').all(message.guild.id);
    if (!row.length) return;

    let triggeredWord = null;
    let softDelete = false;

    for (const r of row) {
        const word = r.word.toLowerCase();
        const type = r.type;
        const content = message.content.toLowerCase();

        if (content.includes(word)) {
            if (type === 'trigger') {
                triggeredWord = word;
                break;
            } else if (type === 'soft') {
                softDelete = true;
                break;
            }
        }
    }

    if (softDelete) {
        message.delete().catch(() => {});
        return;
    }

    if (triggeredWord) {
        message.delete().catch(() => {});
        sendAutomodEmbed(client, message, triggeredWord);
    }
}

async function sendAutomodEmbed(client, message, triggerWord) {
    const row = db.prepare('SELECT channel_id FROM automod_alert WHERE guild_id = ?').get(message.guild.id);
    if (!row) return;

    const alertChannel = message.guild.channels.cache.get(row.channel_id);
    if (!alertChannel) return;

    const users = db.prepare('SELECT user_id FROM automod_alert_users WHERE guild_id = ?').all(message.guild.id).map(r => `<@${r.user_id}>`);
    const roles = db.prepare('SELECT role_id FROM automod_alert_roles WHERE guild_id = ?').all(message.guild.id).map(r => `<@&${r.role_id}>`);
    const ghostPing = [...users, ...roles].join(' ') || '\u200B';

    const embed = new EmbedBuilder()
        .setTitle('Automod Triggered')
        .setColor(0xff0000)
        .setDescription(`A message triggered automod for **${triggerWord}**.\n\nContent:\n\`\`\`${message.content}\`\`\``)
        .addFields({ name: 'Channel', value: `<#${message.channel.id}>`, inline: true })
        .setFooter({ text: `User ID: ${message.author.id}` })
        .setTimestamp();

    const rowButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId(`warn_${message.id}`).setLabel('Warn').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`ban_${message.id}`).setLabel('Ban').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`ignore_${message.id}`).setLabel('Ignore').setStyle(ButtonStyle.Secondary)
        );

    await alertChannel.send({ content: ghostPing, embeds: [embed], components: [rowButtons] });
}

// ===== BUTTON INTERACTIONS =====
function handleInteractions(client) {
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;

        const [action, msgId] = interaction.customId.split('_');
        const memberId = interaction.user.id;
        const allowedIds = ['852839588689870879','1431646610752012420','1431649052696645683'];

        if (!allowedIds.includes(memberId)) {
            return interaction.reply({ content: "you aint important enough brochacho😹", ephemeral: true });
        }

        if (interaction.message.components[0].components.some(b => b.disabled)) {
            return interaction.reply({ content: 'Someone already acted on this message.', ephemeral: true });
        }

        if (action === 'warn') {
            await interaction.reply({ content: 'Please type the reason for the warning:', ephemeral: true });
            const filter = m => m.author.id === memberId;
            const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 60000 });

            collector.on('collect', async m => {
                await m.delete().catch(() => {});
                const embed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0xffff00)
                    .setFooter({ text: `Warned by ${interaction.user.tag}` });
                interaction.message.edit({ embeds: [embed], components: [] });
                interaction.followUp({ content: `User warned for reason: ${m.content}`, ephemeral: true });
            });

        } else if (action === 'ban') {
            await interaction.reply({ content: 'Are you sure you want to ban? Reply with YES to confirm.', ephemeral: true });
            const filter = m => m.author.id === memberId && m.content.toLowerCase() === 'yes';
            const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 60000 });

            collector.on('collect', async () => {
                const userId = interaction.message.embeds[0].footer.text.split('User ID: ')[1];
                const member = await interaction.guild.members.fetch(userId).catch(() => null);
                if (member) await member.ban({ reason: 'Automod triggered' });
                const embed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0xff0000)
                    .setFooter({ text: `Banned by ${interaction.user.tag}` });
                interaction.message.edit({ embeds: [embed], components: [] });
                interaction.followUp({ content: `User banned successfully.`, ephemeral: true });
            });

        } else if (action === 'ignore') {
            const embed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(0x808080)
                .setFooter({ text: `Ignored by ${interaction.user.tag}` });
            interaction.message.edit({ embeds: [embed], components: [] });
            interaction.reply({ content: 'Ignored!', ephemeral: true });
        }
    });
}

// ===== EXPORT =====
module.exports = { db, checkMessage, handleInteractions };