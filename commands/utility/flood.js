const { EmbedBuilder } = require('discord.js');

const OWNER_IDS = ['852839588689870879', '908521674700390430'];

module.exports = {
  name: 'flood',
  description: 'Relay system flood - switches systems when one slows down.',
  category: 'utility',
  hidden: true,
  usage: '$flood <amount> <text> OR $flood [#channel/@user] <amount> <text>',
  async execute(client, message, args) {
    if (!OWNER_IDS.includes(message.author.id)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#f472b6')
            .setDescription("You're not that guy 😹😹")
        ]
      });
    }

    if (!args.length) return message.reply('Usage: `$flood <amount> <text>`');

    let target = message.channel;
    let isDM = false;
    let amount;
    let text;

    // 🎯 SIMPLE TARGET PARSING
    const firstArg = args[0];
    
    // Check if first arg is a mention
    if (firstArg.startsWith('<@') || firstArg.startsWith('<#')) {
      // User mention
      if (firstArg.startsWith('<@')) {
        const userId = firstArg.replace(/[<@!>]/g, '');
        const user = await client.users.fetch(userId).catch(() => null);
        if (user) {
          try {
            target = await user.createDM();
            isDM = true;
            args.shift(); // Remove the mention
          } catch (err) {
            return message.reply(`❌ Could not DM ${user.tag}.`);
          }
        }
      }
      // Channel mention
      else if (firstArg.startsWith('<#')) {
        const channelId = firstArg.replace(/[<#>]/g, '');
        const channel = message.guild?.channels.cache.get(channelId);
        if (channel && channel.isTextBased()) {
          target = channel;
          args.shift(); // Remove the mention
        }
      }
    }
    
    // Parse amount (next argument)
    amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1) return message.reply('Amount must be a number greater than 0.');
    args.shift(); // Remove amount
    
    // Rest is text
    text = args.join(' ');
    if (!text) return message.reply('What am I supposed to send?');

    // 🚀 RELAY SYSTEM START
    const startTime = Date.now();
    console.log(`[RelayFlood] Starting: ${amount} messages to ${isDM ? 'DM' : target.name}`);
    
    // Send starting message
    const startingMsg = await message.reply(`🚀 **Starting relay flood...**\nTarget: ${isDM ? 'DM' : `#${target.name}`}\nAmount: ${amount}\nText: "${text}"`);

    try {
      let sent = 0;
      let failed = 0;
      
      // 🔥 RELAY SYSTEM FOR CHANNELS
      if (!isDM) {
        // Store created webhooks for cleanup
        const allWebhooks = [];
        
        // 🏃‍♂️ RELAY SYSTEM 1: BURST MODE
        const system1 = async () => {
          console.log(`[Relay] System 1 (Burst) activating...`);
          const webhooks = [];
          
          // Create 5 webhooks
          for (let w = 0; w < 5; w++) {
            try {
              const webhook = await target.createWebhook({
                name: `Burst${Date.now()}_${w}`,
                avatar: client.user.displayAvatarURL(),
                reason: 'Relay System 1'
              });
              webhooks.push(webhook);
              allWebhooks.push(webhook);
            } catch { /* ignore */ }
          }
          
          if (webhooks.length === 0) return false;
          
          // Send 3 messages from each webhook at once
          const promises = [];
          webhooks.forEach((webhook, idx) => {
            for (let i = 0; i < 3; i++) {
              if (sent >= amount) break;
              promises.push(
                webhook.send({
                  content: text,
                  username: `Burst${idx}`,
                  avatarURL: client.user.displayAvatarURL()
                }).then(() => {
                  sent++;
                  console.log(`[Relay] Burst sent ${sent}/${amount}`);
                }).catch(() => {
                  failed++;
                })
              );
            }
          });
          
          await Promise.allSettled(promises);
          console.log(`[Relay] System 1 sent: ${promises.length} messages`);
          return promises.length > 0;
        };
        
        // 🏃‍♂️ RELAY SYSTEM 2: FRESH WEBHOOK STREAM
        const system2 = async () => {
          console.log(`[Relay] System 2 (Fresh Stream) activating...`);
          
          // Create fresh webhooks
          const webhooks = [];
          for (let w = 0; w < 4; w++) {
            try {
              const webhook = await target.createWebhook({
                name: `Fresh${Date.now()}_${w}`,
                avatar: client.user.displayAvatarURL(),
                reason: 'Relay System 2'
              });
              webhooks.push(webhook);
              allWebhooks.push(webhook);
            } catch { /* ignore */ }
          }
          
          if (webhooks.length === 0) return false;
          
          // Send continuously for 2 seconds
          const start = Date.now();
          const promises = [];
          
          while (sent < amount && Date.now() - start < 2000) {
            webhooks.forEach(webhook => {
              if (sent >= amount) return;
              promises.push(
                webhook.send({
                  content: text,
                  username: `Fresh${sent}`,
                  avatarURL: client.user.displayAvatarURL()
                }).then(() => {
                  sent++;
                }).catch(() => {
                  failed++;
                })
              );
            });
            
            // Small delay
            await new Promise(r => setTimeout(r, 50));
          }
          
          await Promise.allSettled(promises);
          console.log(`[Relay] System 2 sent: ${promises.length} messages`);
          return promises.length > 0;
        };
        
        // 🏃‍♂️ RELAY SYSTEM 3: ROTATING SINGLES
        const system3 = async () => {
          console.log(`[Relay] System 3 (Rotating) activating...`);
          
          const start = Date.now();
          let messagesSent = 0;
          
          while (sent < amount && Date.now() - start < 3000) {
            // Create fresh webhook
            let webhook;
            try {
              webhook = await target.createWebhook({
                name: `Rotate${Date.now()}`,
                avatar: client.user.displayAvatarURL(),
                reason: 'Relay System 3'
              });
              allWebhooks.push(webhook);
            } catch {
              await new Promise(r => setTimeout(r, 100));
              continue;
            }
            
            // Send 1-2 messages
            const toSend = Math.min(2, amount - sent);
            for (let i = 0; i < toSend; i++) {
              try {
                await webhook.send({
                  content: text,
                  username: `Rotate${i}`,
                  avatarURL: client.user.displayAvatarURL()
                });
                sent++;
                messagesSent++;
              } catch {
                failed++;
                break;
              }
            }
            
            // Delete immediately
            try {
              await webhook.delete();
              // Remove from cleanup list
              const index = allWebhooks.indexOf(webhook);
              if (index > -1) allWebhooks.splice(index, 1);
            } catch { /* ignore */ }
            
            // Tiny delay
            await new Promise(r => setTimeout(r, 10));
          }
          
          console.log(`[Relay] System 3 sent: ${messagesSent} messages`);
          return messagesSent > 0;
        };
        
        // 🏃‍♂️ RELAY SYSTEM 4: DIRECT SEND (fallback)
        const system4 = async () => {
          console.log(`[Relay] System 4 (Direct) activating...`);
          
          const start = Date.now();
          let messagesSent = 0;
          
          while (sent < amount && Date.now() - start < 2000) {
            try {
              await target.send(text);
              sent++;
              messagesSent++;
              
              // Small delay for direct sends
              await new Promise(r => setTimeout(r, 100));
            } catch {
              failed++;
              break;
            }
          }
          
          console.log(`[Relay] System 4 sent: ${messagesSent} messages`);
          return messagesSent > 0;
        };
        
        // 🔁 RELAY CONTROLLER
        const systems = [system1, system2, system3, system4];
        let systemIndex = 0;
        let attempts = 0;
        const maxAttempts = 12; // Max 3 cycles through all systems
        
        while (sent < amount && attempts < maxAttempts) {
          console.log(`[Relay] Running system ${systemIndex + 1}/4`);
          
          const systemStartCount = sent;
          const success = await systems[systemIndex]();
          const sentThisSystem = sent - systemStartCount;
          
          console.log(`[Relay] System ${systemIndex + 1} sent ${sentThisSystem} messages`);
          
          // Move to next system
          systemIndex = (systemIndex + 1) % 4;
          attempts++;
          
          // If system sent less than 5 messages, it's probably dead
          if (sentThisSystem < 5 && sent < amount) {
            console.log(`[Relay] System was slow, speeding up rotation`);
            // Skip to next system faster
            systemIndex = (systemIndex + 1) % 4;
          }
          
          // Small pause between systems
          if (sent < amount) {
            await new Promise(r => setTimeout(r, 100));
          }
        }
        
        // FINAL CLEANUP
        console.log(`[Relay] Cleaning up ${allWebhooks.length} webhooks...`);
        for (const webhook of allWebhooks) {
          try {
            await webhook.delete().catch(() => {});
          } catch { /* ignore */ }
        }
        
      } else {
        // 📨 DM VERSION (Simpler)
        console.log(`[Relay] Starting DM flood...`);
        
        let attempts = 0;
        while (sent < amount && attempts < 30) {
          try {
            await target.send(text);
            sent++;
            console.log(`[Relay] DM sent ${sent}/${amount}`);
            
            // DM needs more delay
            await new Promise(r => setTimeout(r, 200));
          } catch (err) {
            failed++;
            console.log(`[Relay] DM failed: ${err.message}`);
            // Wait longer on error
            await new Promise(r => setTimeout(r, 1000));
          }
          attempts++;
        }
      }
      
      // 📊 RESULTS
      const totalTime = (Date.now() - startTime) / 1000;
      const speed = totalTime > 0 ? Math.round(sent / totalTime) : 0;
      
      // Delete starting message
      startingMsg.delete().catch(() => {});
      
      const resultEmbed = new EmbedBuilder()
        .setColor(sent >= amount ? '#00ff00' : '#ffaa00')
        .setTitle(sent >= amount ? '✅ RELAY FLOOD COMPLETE' : '⚠️ RELAY FLOOD PARTIAL')
        .setDescription(`**Target:** ${isDM ? 'User DM' : `#${target.name}`}`)
        .addFields(
          { name: 'Success', value: `${sent}/${amount}`, inline: true },
          { name: 'Failed', value: `${failed}`, inline: true },
          { name: 'Time', value: `${totalTime.toFixed(2)}s`, inline: true },
          { name: 'Speed', value: `${speed}/sec`, inline: true },
          { name: 'Completion', value: `${Math.round((sent/amount)*100)}%`, inline: true },
          { name: 'Systems Used', value: '4-System Relay', inline: true }
        )
        .setFooter({ text: 'Relay System - Always fresh and fast' })
        .setTimestamp();
      
      const resultMsg = await message.reply({ embeds: [resultEmbed] });
      setTimeout(() => resultMsg.delete().catch(() => {}), 5000);
      
      console.log(`[RelayFlood] FINISHED: ${sent}/${amount} in ${totalTime.toFixed(2)}s (${speed}/sec)`);
      
    } catch (error) {
      console.error('[RelayFlood] Fatal error:', error);
      startingMsg.delete().catch(() => {});
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('💥 RELAY FLOOD FAILED')
            .setDescription(`**Error:** ${error.message}`)
        ]
      }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
    }
  },
};