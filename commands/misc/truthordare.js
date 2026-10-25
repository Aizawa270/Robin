const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} = require('discord.js');

const { createEmbed } = require('../../handlers/universalHelper');

// ========================================
// TRUTH QUESTIONS
// ========================================

const truths = [
    // Existing questions
    "What's your most used app on your phone?",
    "What's the last lie you told?",
    "What's a secret you've never told anyone?",
    "What's your biggest fear?",
    "What's something you regret doing?",
    "Who was your first crush?",
    "What's your biggest insecurity?",
    "What's something you can't live without?",
    "What's the weirdest dream you've had?",
    "What's your biggest pet peeve?",
    "What's your favorite childhood memory?",
    "What's the last thing you searched on your phone?",
    "Have you ever cheated in a game?",
    "What's something you're bad at but pretend you're good at?",
    "What's your guilty pleasure?",
    "What's the most embarrassing thing you've done?",
    "What's your biggest habit?",
    "What's something you're proud of?",
    "What's your favorite food?",
    "What's your least favorite subject?",
    "What's a skill you wish you had?",
    "What's your dream job?",
    "What's the best compliment you've received?",
    "What's your favorite song right now?",
    "What's a secret talent you have?",
    "What's the last thing that made you laugh?",
    "What's your biggest goal this year?",
    "What's your favorite game?",
    "What's something that annoys you instantly?",
    "What's your favorite movie?",
    "What's something you're afraid to try?",
    "What's your dream place to visit?",
    "What's the best advice you've ever gotten?",
    "What's your favorite color?",
    "What's something you can't stop doing?",
    "What's your favorite memory with friends?",
    "What's something you dislike about yourself?",
    "What's your favorite season?",
    "What's something you would change about your life?",
    "What's your favorite anime?",
    "What's the last thing you ate?",
    "What's your favorite hobby?",
    "What's something you're currently obsessed with?",
    "What's your favorite subject in school?",
    "What's something you wish you knew earlier?",
    "What's your biggest weakness?",
    "What's your biggest strength?",
    "What's something you've never tried?",
    "What's your favorite snack?",

    // New questions
    "What's one thing that instantly puts you in a good mood?",
    "What's a habit you'd like to develop?",
    "What's the funniest misunderstanding you've ever had?",
    "What's something you always procrastinate on?",
    "If you could instantly master one skill, what would it be?",
    "What's a movie you could watch over and over?",
    "What's a food you absolutely refuse to eat?",
    "What's the best gift you've ever received?",
    "What's something you believed when you were younger?",
    "What's a song you know almost every word to?",
    "What's something you'd love to learn this year?",
    "What's your favorite way to spend a free day?",
    "What's the most spontaneous thing you've ever done?",
    "What's something that makes you nervous?",
    "What's something you're surprisingly competitive about?",
    "What's your ideal weekend?",
    "What's the worst advice you've ever received?",
    "Which fictional world would you visit for a day?",
    "Have you ever pretended to understand something when you didn't?",
    "What's something you wish more people understood about you?",
    "What's a random fact you remember for no reason?",
    "What's the kindest thing someone has done for you?",
    "What's something you're looking forward to?",
    "What's a game you'd recommend to everyone?",
    "What's a funny nickname you've had?",
    "What's your biggest pet peeve online?",
    "What's one rule you'd add to this server?",
    "What's an unusual food combination you enjoy?",
    "What's something you've changed your mind about recently?",
    "What's something you find funny that most people don't?",
    "What's the longest you've gone without checking your phone?",
    "What's one thing you would put on your bucket list?",
    "What's the most useless fact you know?",
    "What's something you could talk about for hours?",
    "What's your favorite thing to do with friends?",
    "What's one thing that instantly annoys you in a game?",
    "What's the funniest thing that's happened in a group chat?",
    "What's something you wish you were better at?",
    "What's your favorite thing about your hometown?",
    "What's a fictional character you relate to?",
    "What's the most unusual dream you've had recently?",
    "What's a trend you never understood?",
    "What's one thing you would change about school?",
    "What's a small achievement you're proud of?",
    "What's something you find difficult but want to improve at?",
    "What's your favorite thing about the internet?",
    "What's a game you used to play but don't anymore?",
    "What's one thing you would do with an entire day off?",
    "What's a sound that instantly annoys you?",
    "What's the funniest excuse you've ever heard?",
    "What's something you collect or would like to collect?",
    "What's one thing you've always wanted to try?",
    "What's your favorite kind of weather?",
    "What's something that always makes you laugh?",
    "What's the most interesting conversation you've had recently?",
    "What's one thing you appreciate about your friends?",
    "What's your favorite thing about your personality?",
    "What's something you would love to be famous for?",
    "What's your favorite childhood game?",
    "What's a fictional character you'd like to be friends with?",
    "What's one thing you would never get bored of?",
    "What's the funniest thing you've seen online lately?",
    "What's a small thing that makes your day better?",
    "What's something you want to accomplish before the year ends?",
    "What's one thing you would tell your younger self?",
    "What's your favorite way to relax after a busy day?",
    "What's something you've always been curious about?",
    "What's one thing you think everyone should experience?",
    "What's the most random thing you've done with a friend?",
    "What's something you can do that surprises people?",
    "What's a song that brings back memories for you?",
    "What's your favorite type of video to watch?",
    "What's one fictional ability you'd love to have?",
];

// ========================================
// DARES
// ========================================

const dares = [
    // Existing dares
    "Send a random emoji to the chat.",
    "Say something nice about the last person who chatted.",
    "Type with your eyes closed for your next message.",
    "Use only emojis for the next 3 messages.",
    "Talk in caps for the next minute.",
    "Tell a joke.",
    "Send your favorite meme.",
    "Write your name using emojis.",
    "Say something in another language.",
    "Describe yourself in 3 words.",
    "Send 5 random emojis.",
    "Say a tongue twister.",
    "Act like a robot for 2 messages.",
    "Compliment someone in the chat.",
    "Type your last message again but slower.",
    "Send a random fun fact about yourself.",
    "Make a 1-line rap about yourself.",
    "Act like a detective solving a mystery.",
    "Say something dramatic like a movie character.",
    "Use only one-word replies for 5 minutes.",

    // New dares
    "Tell a joke that you think will make everyone laugh.",
    "Send a positive message to someone in the chat.",
    "Share a harmless unpopular opinion.",
    "Write a two-line poem about this server.",
    "Describe your favorite game without naming it.",
    "Recommend a song to everyone in the chat.",
    "Tell a silly dad joke.",
    "Explain your favorite hobby in exactly one sentence.",
    "Create a new word and explain what it means.",
    "Say something nice about this server.",
    "Reply to the next message with a rhyming sentence.",
    "Try saying 'red leather, yellow leather' three times.",
    "Write a dramatic headline about what's happening in this chat.",
    "Describe your day using three emojis.",
    "Turn an ordinary sentence into a dramatic movie line.",
    "Invent a superhero name for the person who last chatted.",
    "Share a weird but harmless fact.",
    "Send a message without using the letter E.",
    "Make up a short story using three random words.",
    "Give a fake weather report for this server.",
    "Pretend to be a sports commentator for your next message.",
    "Make a fake announcement about something completely silly.",
    "Write a one-line motivational quote.",
    "Describe yourself as if you were a video game character.",
    "Make up a new holiday and explain how people celebrate it.",
    "Give the person above you a friendly nickname.",
    "Write a sentence where every word starts with the same letter.",
    "Explain your favorite movie without revealing its name.",
    "Say something like you're announcing the winner of a competition.",
    "Write a short advertisement for your favorite snack.",
    "Describe your current mood as a movie title.",
    "Invent a ridiculous law that everyone in this server must follow.",
    "Write a one-sentence mystery for the chat to solve.",
    "Send a fun fact about an animal.",
    "Create a funny username for yourself.",
    "Describe a normal activity as if it's an extreme sport.",
    "Make up a fictional news story about your favorite game.",
    "Write a compliment without using the words 'nice' or 'good'.",
    "Pretend you're a teacher explaining something completely useless.",
    "Make a slogan for this server.",
    "Come up with a new name for the internet.",
    "Describe your favorite food like a professional food critic.",
    "Write a mini rap about your favorite game.",
    "Make up three funny names for a fictional pet.",
    "Explain why your favorite fictional character would be a terrible roommate.",
    "Write a dramatic goodbye as if you're leaving a TV show.",
    "Give everyone in the chat a conversation topic.",
    "Describe your dream holiday in exactly ten words.",
    "Make up a funny excuse for being late to a meeting.",
    "Create a title for a movie about your life.",
];

// ========================================
// BUTTONS
// ========================================

function createButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('tod:truth')
            .setLabel('Truth')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('tod:dare')
            .setLabel('Dare')
            .setStyle(ButtonStyle.Danger)
    );
}

// ========================================
// RANDOM QUESTION PICKER
// ========================================

function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
}

// ========================================
// EMBED CREATOR
// ========================================

function buildEmbed(client, message, title, description, footer) {
    return createEmbed(client, message, {
        title,
        description,
        footer: {
            text: footer.text,
            iconURL: footer.iconURL,
        },
    });
}

// ========================================
// TRUTH OR DARE COMMAND
// ========================================

module.exports = {
    name: 'truthordare',
    aliases: ['ToD'],
    description: 'Play Truth or Dare using interactive buttons.',
    category: 'fun',
    usage: '$truthordare',

    async execute(client, message, args) {
        // Initial embed
        const embed = buildEmbed(
            client,
            message,
            'TRUTH OR DARE',
            'Choose **Truth** or **Dare** using the buttons below!\n\nAnyone in the channel can play. Keep clicking to get more questions.',
            {
                text: `Game started by ${message.author.username}`,
                iconURL: message.author.displayAvatarURL(),
            }
        );

        const buttons = createButtons();

        // Send the game message.
        const gameMessage = await message.reply({
            embeds: [embed],
            components: [buttons],
        });

        // Listen for button clicks on this message.
        // No time limit: the buttons remain usable while the bot
        // is running and the game message still exists.
        const collector = gameMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
        });

        collector.on('collect', async interaction => {
            let selected;
            let title;

            // Anyone can click either button.
            if (interaction.customId === 'tod:truth') {
                selected = randomItem(truths);
                title = 'TRUTH';
            } else if (interaction.customId === 'tod:dare') {
                selected = randomItem(dares);
                title = 'DARE';
            } else {
                return interaction.deferUpdate().catch(() => {});
            }

            const updatedEmbed = buildEmbed(
                client,
                message,
                title,
                selected,
                {
                    text: `Chosen by ${interaction.user.username} | Game started by ${message.author.username}`,
                    iconURL: interaction.user.displayAvatarURL(),
                }
            );

            try {
                // Update the SAME message and keep both buttons.
                await interaction.update({
                    embeds: [updatedEmbed],
                    components: [createButtons()],
                });
            } catch (error) {
                console.error(
                    '[TruthOrDare] Failed to update the game:',
                    error
                );

                // Acknowledge the interaction if it hasn't already
                // been acknowledged, such as when an update fails.
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.deferUpdate().catch(() => {});
                }
            }
        });

        return gameMessage;
    },
};