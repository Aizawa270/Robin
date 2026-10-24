const { createEmbed } = require('../../handlers/universalHelper');

// ================================
// TRUTH QUESTIONS
// ================================

const truths = [
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
    "What's your favorite snack?"
];

// ================================
// DARES
// ================================

const dares = [
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
    "Use only one-word replies for 5 minutes."
];

// ================================
// TRUTH OR DARE COMMAND
// ================================

module.exports = {
    name: 'truthordare',
    aliases: ['tnd', 'tod'],
    description: 'Get a random truth question or dare.',
    category: 'fun',
    usage: '$truthordare',

    async execute(client, message, args) {
        // Randomly select truth or dare.
        const isTruth = Math.random() < 0.5;

        const selected = isTruth
            ? truths[Math.floor(Math.random() * truths.length)]
            : dares[Math.floor(Math.random() * dares.length)];

        const title = isTruth
            ? 'TRUTH'
            : 'DARE';

        // Use UniversalHelper for your configured embed colour.
        const embed = createEmbed(client, message, {
            title: `🎭 ${title}`,
            description: selected,
            footer: {
                text: `Requested by ${message.author.username}`,
                iconURL: message.author.displayAvatarURL()
            }
        });

        return message.reply({
            embeds: [embed]
        });
    }
};