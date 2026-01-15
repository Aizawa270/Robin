// handlers/welcomeHandler.js
const { EmbedBuilder } = require('discord.js');

// Channel IDs
const WELCOME_CHANNEL_ID = '1431855676367573012';
const CHAT_CHANNEL_ID = '1440412904364179647';

// Channel mentions
const CHANNELS = {
  roles: '1432440696542855412',
  chat: '1440412904364179647',
  rules: '1431675851568840765',
  faq: '1431680409048977448'
};

// Images
const WELCOME_IMAGE = 'https://cdn.discordapp.com/attachments/1441397646462812182/1449707001830445218/1219b96e46828c443fe606b661d065d7.png';
const ANNOUNCEMENT_IMAGE = 'https://cdn.discordapp.com/attachments/1441397646462812182/1449719860501155912/20251214_170753.jpg';

module.exports = (client) => {
  client.on('guildMemberAdd', async (member) => {
    try {
      const guild = member.guild;

      // Main welcome embed (sent to welcome channel)
      const welcomeChannel = guild.channels.cache.get(WELCOME_CHANNEL_ID);
      if (welcomeChannel) {
        const welcomeEmbed = new EmbedBuilder()
          .setColor('#9b59b6')
          .setAuthor({
            name: member.user.username,
            iconURL: member.user.displayAvatarURL({ dynamic: true, size: 128 })
          })
          .setTitle('「 ✦ 𝐕𝐘𝐍𝐎𝐑𝐀 ✦ 」')
          .setDescription(
            `**...................................................**\n` +
            `ᶻᶻ   ﹒ welcome to the vynora ${member}  ‹3\n` +
            `    ♡  ﹕ <#${CHANNELS.roles}>   ﹕♡\n` +
            `    ♡  ﹕ <#${CHANNELS.chat}>    ﹕♡\n` +
            `    ♡  ﹕ <#${CHANNELS.rules}>     ﹕♡\n` +
            `    ♡  ﹕ <#${CHANNELS.faq}>   ﹕♡\n` +
            `  >﹏﹐please enjoy your stay.~!\n` +
            `**...................................................**`
          )
          .setImage(WELCOME_IMAGE)
          .setFooter({ text: '✧˖ .gg/hanging ° |' })
          .setTimestamp();

        await welcomeChannel.send({ embeds: [welcomeEmbed] });
      }

      // Announcement embed (sent to chat channel)
      const chatChannel = guild.channels.cache.get(CHAT_CHANNEL_ID);
      if (chatChannel) {
        const announcementEmbed = new EmbedBuilder()
          .setColor('#9b59b6')
          .setAuthor({
            name: `${member.user.username} has entered Vynora!`,
            iconURL: member.user.displayAvatarURL({ dynamic: true, size: 128 })
          })
          .setDescription(
            `ᶻᶻ   ﹒ welcome to the vynora ${member}  ‹3\n` +
            `    ♡  ﹕ <#${CHANNELS.roles}>   ﹕♡\n` +
            `    ♡  ﹕ <#${CHANNELS.chat}>    ﹕♡\n` +
            `    ♡  ﹕ <#${CHANNELS.rules}>     ﹕♡\n` +
            `    ♡  ﹕ <#${CHANNELS.faq}>   ﹕♡\n\n` +
            `𝒽𝑜𝓅𝑒 𝓎𝑜𝓊 𝑒𝓃𝒿𝑜𝓎 𝓎𝑜𝓊𝓇 𝓈𝓉𝒶𝓎!`
          )
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
          .setImage(ANNOUNCEMENT_IMAGE)
          .setTimestamp();

        await chatChannel.send({ embeds: [announcementEmbed] });
      }

      console.log(`✅ Welcome message sent for ${member.user.tag}`);
    } catch (error) {
      console.error('Welcome system error:', error);
    }
  });

  console.log('🎉 Welcome system initialized');
};