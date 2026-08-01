const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTimestamp();

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);

  return embed;
}

function getRolePos(member) {
  return member?.roles?.highest?.position ?? 0;
}

function isOwner(guild, member) {
  return !!guild?.ownerId && member?.id === guild.ownerId;
}

function buildUsage(prefix) {
  return makeEmbed(
    '#facc15',
    'Warn Command Usage',
    `**Usage:** \`${prefix}warn <@user|ID|username|display name> <reason>\`\n\n` +
    `**Examples:**\n` +
    `${prefix}warn @User spamming\n` +
    `${prefix}warn 123456789012345678 breaking rules`
  );
}


// ---------- DB ----------
function getWarnCountFromDB(client, guildId, userId) {
  try {
    if (!client.automodDB) return 0;

    const row = client.automodDB.prepare(`
      SELECT count FROM automod_warn_counts
      WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);

    return row?.count || 0;

  } catch (err) {
    console.error('[Warn] count error:', err);
    return 0;
  }
}


function addWarnToDB(client, guildId, userId, moderatorId, reason) {
  try {

    if (!client.automodDB) return false;

    client.automodDB.prepare(`
      INSERT INTO automod_warns
      (guild_id,user_id,moderator_id,reason,timestamp)
      VALUES (?,?,?,?,?)
    `).run(
      guildId,
      userId,
      moderatorId,
      reason,
      Date.now()
    );


    client.automodDB.prepare(`
      INSERT OR REPLACE INTO automod_warn_counts
      (guild_id,user_id,count)
      VALUES (
        ?,
        ?,
        COALESCE(
          (
            SELECT count 
            FROM automod_warn_counts 
            WHERE guild_id=? AND user_id=?
          ),0
        ) + 1
      )
    `).run(
      guildId,
      userId,
      guildId,
      userId
    );


    return true;

  } catch(err){
    console.error('[Warn] add error:',err);
    return false;
  }
}


function clearWarnsFromDB(client,guildId,userId){

  try{

    if(!client.automodDB) return false;

    client.automodDB.prepare(
      `DELETE FROM automod_warns WHERE guild_id=? AND user_id=?`
    ).run(guildId,userId);

    client.automodDB.prepare(
      `DELETE FROM automod_warn_counts WHERE guild_id=? AND user_id=?`
    ).run(guildId,userId);

    return true;

  }catch(err){
    console.error('[Warn] clear error:',err);
    return false;
  }

}



async function resolveTargetUser(message,input){

  if(!input) return null;

  if(typeof message.resolveUser === 'function'){
    return await message.resolveUser(input);
  }


  const raw = String(input).trim();

  const mention = raw.match(/^<@!?(\d{15,20})>$/);

  const id = mention?.[1] || raw.replace(/[<@!>]/g,'');


  if(/^\d{15,20}$/.test(id)){

    return (
      message.client.users.cache.get(id) ||
      await message.client.users.fetch(id).catch(()=>null)
    );

  }


  const lowered = raw.toLowerCase();


  const cached = message.client.users.cache.find(u =>
    u.username?.toLowerCase() === lowered ||
    u.globalName?.toLowerCase() === lowered ||
    u.tag?.toLowerCase() === lowered
  );


  if(cached) return cached;


  if(message.guild){

    const member = message.guild.members.cache.find(m =>
      m.displayName?.toLowerCase() === lowered ||
      m.user.username?.toLowerCase() === lowered ||
      m.user.globalName?.toLowerCase() === lowered
    );


    if(member?.user) return member.user;


    const fetched = await message.guild.members.fetch({
      query:raw,
      limit:10
    }).catch(()=>null);


    if(fetched?.size)
      return fetched.first().user;
  }


  return null;
}



async function resolveTargetMember(message,input){

  if(typeof message.resolveMember === 'function'){
    return await message.resolveMember(input);
  }


  const user = await resolveTargetUser(message,input);

  if(!user) return null;


  return (
    message.guild.members.cache.get(user.id) ||
    await message.guild.members.fetch(user.id).catch(()=>null)
  );

}




module.exports = {

name:'warn',

description:'Warn a user. Auto-bans at 5 warns.',

category:'mod',

usage:'$warn <user> <reason>',



async execute(client,message,args){


if(!message.guild) return;



if(
!message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
!message.member.permissions.has(PermissionFlagsBits.Administrator)
){

return message.reply({
embeds:[
makeEmbed(
'#ef4444',
'Warn Failed',
'You need **Moderate Members** permission.'
)
]
});

}



const prefix =
message.prefix ||
client.getPrefix?.(message.guild.id) ||
'$';



if(!args.length){

return message.reply({
embeds:[buildUsage(prefix)]
});

}



const targetInput=args[0];

const reason =
args.slice(1).join(' ').trim() ||
'No reason provided';



const targetUser =
await resolveTargetUser(message,targetInput);



if(!targetUser){

return message.reply({
embeds:[
makeEmbed(
'#f59e0b',
'Warn Failed',
'User not found.'
)
]
});

}



if(targetUser.id===message.author.id){

return message.reply({
embeds:[
makeEmbed(
'#ef4444',
'Warn Failed',
'You cannot warn yourself.'
)
]
});

}



if(targetUser.id===client.user.id){

return message.reply({
embeds:[
makeEmbed(
'#ef4444',
'Warn Failed',
'I cannot warn myself.'
)
]
});

}



const member =
await resolveTargetMember(message,targetInput);



if(!member){

return message.reply({
embeds:[
makeEmbed(
'#f59e0b',
'Warn Failed',
'User is not in this server.'
)
]
});

}



const botMember =
message.guild.members.me ||
await message.guild.members.fetchMe().catch(()=>null);



if(isOwner(message.guild,member) &&
!isOwner(message.guild,message.member)){

return message.reply({
embeds:[
makeEmbed(
'#ef4444',
'Warn Failed',
'You cannot warn the server owner.'
)
]
});

}



if(!isOwner(message.guild,message.member)){

if(getRolePos(member)>=getRolePos(message.member)){

return message.reply({
embeds:[
makeEmbed(
'#ef4444',
'Warn Failed',
'You cannot warn someone with equal or higher role.'
)
]
});

}

}



if(botMember && getRolePos(member)>=getRolePos(botMember)){

return message.reply({
embeds:[
makeEmbed(
'#ef4444',
'Warn Failed',
'I cannot warn that user because my role is too low.'
)
]
});

}



if(member.permissions.has(PermissionFlagsBits.Administrator)){

return message.reply({
embeds:[
makeEmbed(
'#ef4444',
'Warn Failed',
'Cannot warn an administrator.'
)
]
});

}



const added =
addWarnToDB(
client,
message.guild.id,
targetUser.id,
message.author.id,
reason
);



if(!added){

return message.reply({
embeds:[
makeEmbed(
'#ef4444',
'Warn Failed',
'Failed to save warning.'
)
]
});

}



try{

const {logModAction}=require('../../handlers/modstatsHelper');

logModAction(
client,
message.guild.id,
message.author.id,
targetUser.id,
'warn',
reason
);

}catch(err){

console.error('[Warn] log failed:',err);

}



const warnCount =
getWarnCountFromDB(
client,
message.guild.id,
targetUser.id
);



if(warnCount>=5){

try{


await member.ban({
reason:`Auto-ban: reached 5 warns (${reason})`
});


clearWarnsFromDB(
client,
message.guild.id,
targetUser.id
);



return message.reply({

embeds:[

makeEmbed(
'#ef4444',
'User Auto-Banned',
`<@${targetUser.id}> reached **5/5 warnings** and was automatically banned.`
)

]

});


}catch(err){

console.error('[Warn] autoban:',err);

}

}




return message.reply({

embeds:[

new EmbedBuilder()

.setColor('#facc15')

.setTitle('User Warned')

.setThumbnail(
targetUser.displayAvatarURL({size:1024})
)

.addFields(

{
name:'User',
value:`<@${targetUser.id}>`,
inline:false
},

{
name:'Moderator',
value:`<@${message.author.id}>`,
inline:false
},

{
name:'Reason',
value:reason,
inline:false
},

{
name:'Total Warns',
value:`${warnCount}/5`,
inline:false
}

)

.setTimestamp()

]

});


}

};