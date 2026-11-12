const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} = require('discord.js');

const { randomUUID } = require('node:crypto');
const { createEmbed } = require('../../handlers/universalHelper');

// --------------------------------------------------
// CONFIGURATION
// --------------------------------------------------

const GAME_TIMEOUT = 180_000; // 3 minutes

// Tracks players currently participating in games.
const activeGames = new Map();

// --------------------------------------------------
// UNIVERSAL HELPER
// --------------------------------------------------

function createGameEmbed(client, message, options = {}) {
    const embed = createEmbed(client, message, options);
    embed.setTimestamp();

    return embed;
}

function getServerFooter(guild, extra = 'Tic Tac Toe') {
    return `${guild?.name || 'Server'} • ${extra}`;
}

// --------------------------------------------------
// TIC TAC TOE GAME
// --------------------------------------------------

class TicTacToeGame {
    constructor(client, commandMessage, player1, player2) {
        this.client = client;
        this.commandMessage = commandMessage;

        this.player1 = player1;
        this.player2 = player2;

        this.currentTurn = player1;

        // Unique ID prevents button ID collisions between games.
        this.gameId = randomUUID().slice(0, 8);

        this.board = Array.from(
            { length: 3 },
            () => Array(3).fill(null)
        );

        this.winner = null;
        this.draw = false;
        this.finished = false;

        this.message = null;
        this.collector = null;
        this.processing = false;
    }

    // ------------------------------------------------
    // PLAYER SYMBOLS
    // ------------------------------------------------

    markFor(player) {
        return player.id === this.player1.id ? '❌' : '⭕';
    }

    playerForMark(mark) {
        return mark === '❌' ? this.player1 : this.player2;
    }

    // ------------------------------------------------
    // BUTTON GRID
    // ------------------------------------------------

    createButtons(disableAll = false) {
        const rows = [];

        for (let row = 0; row < 3; row++) {
            const actionRow = new ActionRowBuilder();

            for (let col = 0; col < 3; col++) {
                const mark = this.board[row][col];

                actionRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `ttt_${this.gameId}_${row}_${col}`
                        )
                        .setStyle(
                            mark === '❌'
                                ? ButtonStyle.Danger
                                : mark === '⭕'
                                    ? ButtonStyle.Primary
                                    : ButtonStyle.Secondary
                        )
                        .setLabel(mark || '⬜')
                        .setDisabled(disableAll || mark !== null)
                );
            }

            rows.push(actionRow);
        }

        return rows;
    }

    // ------------------------------------------------
    // BOARD DISPLAY
    // ------------------------------------------------

    getBoardDisplay() {
        return this.board
            .map(row => row.map(cell => cell || '⬜').join(' | '))
            .join('\n───────────\n');
    }

    // ------------------------------------------------
    // WIN DETECTION
    // ------------------------------------------------

    checkWinner() {
        const board = this.board;

        // Horizontal lines.
        for (const row of board) {
            if (
                row[0] &&
                row[0] === row[1] &&
                row[1] === row[2]
            ) {
                this.winner = this.playerForMark(row[0]);
                return true;
            }
        }

        // Vertical lines.
        for (let col = 0; col < 3; col++) {
            if (
                board[0][col] &&
                board[0][col] === board[1][col] &&
                board[1][col] === board[2][col]
            ) {
                this.winner = this.playerForMark(board[0][col]);
                return true;
            }
        }

        // Diagonal: top-left to bottom-right.
        if (
            board[0][0] &&
            board[0][0] === board[1][1] &&
            board[1][1] === board[2][2]
        ) {
            this.winner = this.playerForMark(board[0][0]);
            return true;
        }

        // Diagonal: top-right to bottom-left.
        if (
            board[0][2] &&
            board[0][2] === board[1][1] &&
            board[1][1] === board[2][0]
        ) {
            this.winner = this.playerForMark(board[0][2]);
            return true;
        }

        return false;
    }

    // ------------------------------------------------
    // DRAW DETECTION
    // ------------------------------------------------

    checkDraw() {
        const full = this.board.every(
            row => row.every(cell => cell !== null)
        );

        if (full && !this.winner) {
            this.draw = true;
            return true;
        }

        return false;
    }

    // ------------------------------------------------
    // EMBED BUILDER
    // ------------------------------------------------

    buildEmbed() {
        const guild = this.commandMessage.guild;

        const fields = [
            {
                name: '❌ Player 1',
                value: `${this.player1}`,
                inline: true,
            },
            {
                name: '⭕ Player 2',
                value: `${this.player2}`,
                inline: true,
            },
            {
                name: 'BOARD',
                value: this.getBoardDisplay(),
                inline: false,
            },
        ];

        let description;

        if (this.winner) {
            description = `**${this.winner.displayName} wins!**`;

            fields.push({
                name: 'RESULT',
                value: `${this.markFor(this.winner)} Victory!`,
                inline: false,
            });
        } else if (this.draw) {
            description = '**The game ended in a draw!**';

            fields.push({
                name: 'RESULT',
                value: 'Nobody won this round.',
                inline: false,
            });
        } else {
            description =
                `It is **${this.currentTurn.displayName}**'s turn.`;

            fields.push({
                name: 'TURN',
                value:
                    `${this.markFor(this.currentTurn)} ` +
                    `${this.currentTurn.displayName}`,
                inline: false,
            });
        }

        return createGameEmbed(
            this.client,
            this.commandMessage,
            {
                title: '✦ TIC TAC TOE ✦',
                description,
                fields,
                footer: {
                    text: getServerFooter(
                        guild,
                        this.finished ? 'Game Finished' : 'Tic Tac Toe'
                    ),
                },
            }
        );
    }

    // ------------------------------------------------
    // CLEANUP
    // ------------------------------------------------

    cleanup() {
        for (const [userId, game] of activeGames.entries()) {
            if (game === this) {
                activeGames.delete(userId);
            }
        }
    }

    // ------------------------------------------------
    // HANDLE BUTTON CLICKS
    // ------------------------------------------------

    async handleClick(interaction) {
        if (this.finished) {
            return interaction.reply({
                content: 'This game has already ended!',
                ephemeral: true,
            });
        }

        if (this.processing) {
            return interaction.reply({
                content: 'A move is already being processed. Try again!',
                ephemeral: true,
            });
        }

        // Only the two players may interact.
        const isPlayer =
            interaction.user.id === this.player1.id ||
            interaction.user.id === this.player2.id;

        if (!isPlayer) {
            return interaction.reply({
                content: 'You are not a player in this game!',
                ephemeral: true,
            });
        }

        // Only the current player can move.
        if (interaction.user.id !== this.currentTurn.id) {
            return interaction.reply({
                content:
                    `It is **${this.currentTurn.displayName}**'s turn!`,
                ephemeral: true,
            });
        }

        const match = interaction.customId.match(
            new RegExp(`^ttt_${this.gameId}_([0-2])_([0-2])$`)
        );

        if (!match) {
            return interaction.reply({
                content: 'That move is invalid.',
                ephemeral: true,
            });
        }

        const row = Number(match[1]);
        const col = Number(match[2]);

        if (this.board[row][col] !== null) {
            return interaction.reply({
                content: 'That square is already taken!',
                ephemeral: true,
            });
        }

        this.processing = true;

        try {
            // Place the current player's mark.
            this.board[row][col] = this.markFor(this.currentTurn);

            // Check for a winner.
            if (this.checkWinner()) {
                this.finished = true;

                await interaction.update({
                    embeds: [this.buildEmbed()],
                    components: this.createButtons(true),
                });

                this.collector?.stop('finished');

                await interaction.followUp({
                    content:
                        `Congratulations ${this.winner}! ` +
                        'You won the Tic Tac Toe game!',
                }).catch(() => {});

                return;
            }

            // Check for a draw.
            if (this.checkDraw()) {
                this.finished = true;

                await interaction.update({
                    embeds: [this.buildEmbed()],
                    components: this.createButtons(true),
                });

                this.collector?.stop('finished');

                await interaction.followUp({
                    content: 'The Tic Tac Toe game ended in a draw!',
                }).catch(() => {});

                return;
            }

            // Switch turns.
            this.currentTurn =
                this.currentTurn.id === this.player1.id
                    ? this.player2
                    : this.player1;

            await interaction.update({
                embeds: [this.buildEmbed()],
                components: this.createButtons(),
            });
        } finally {
            this.processing = false;
        }
    }

    // ------------------------------------------------
    // TIMEOUT
    // ------------------------------------------------

    async onTimeout() {
        if (this.finished) return;

        this.finished = true;

        const embed = createGameEmbed(
            this.client,
            this.commandMessage,
            {
                title: '✦ TIC TAC TOE | GAME OVER ✦',
                description:
                    'The game ended because nobody made a move in time.',
                footer: {
                    text: getServerFooter(
                        this.commandMessage.guild,
                        'Game Timed Out'
                    ),
                },
            }
        );

        await this.message.edit({
            embeds: [embed],
            components: this.createButtons(true),
        }).catch(() => {});
    }

    // ------------------------------------------------
    // COLLECTOR
    // ------------------------------------------------

    start(message) {
        this.message = message;

        this.collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            idle: GAME_TIMEOUT,
        });

        this.collector.on('collect', async interaction => {
            try {
                await this.handleClick(interaction);
            } catch (error) {
                console.error('[TicTacToe] Button error:', error);

                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'Something went wrong processing that move.',
                        ephemeral: true,
                    }).catch(() => {});
                }
            }
        });

        this.collector.on('end', async (_collected, reason) => {
            if (reason === 'idle' && !this.finished) {
                await this.onTimeout();
            }

            this.cleanup();
        });
    }
}

// --------------------------------------------------
// HELP COMMAND
// --------------------------------------------------

async function showTicTacToeHelp(client, message) {
    const prefix = client.getPrefix?.(message.guild?.id) || '$';

    const embed = createGameEmbed(client, message, {
        title: '✦ TIC TAC TOE GUIDE ✦',
        description:
            'Challenge a friend to Tic Tac Toe using interactive buttons!',
        fields: [
            {
                name: '🎮 Start a Game',
                value: `\`${prefix}ttt @opponent\``,
                inline: false,
            },
            {
                name: '📖 How to Play',
                value:
                    '1. Challenge another player.\n' +
                    '2. Player 1 starts with ❌.\n' +
                    '3. Player 2 uses ⭕.\n' +
                    '4. Take turns clicking empty squares.\n' +
                    '5. Get three marks in a row to win!',
                inline: false,
            },
            {
                name: '🏆 Rules',
                value:
                    '• You cannot play against yourself.\n' +
                    '• Bots cannot be opponents.\n' +
                    '• Only the two players can make moves.\n' +
                    '• You can only select empty squares.\n' +
                    '• Games time out after 3 minutes of inactivity.',
                inline: false,
            },
            {
                name: '⌨️ Commands',
                value:
                    `\`${prefix}ttt @user\` — Start a game\n` +
                    `\`${prefix}ttt help\` — Show this guide\n` +
                    `\`${prefix}ttthelp\` — Show this guide`,
                inline: false,
            },
        ],
        footer: {
            text: getServerFooter(message.guild, 'Game Guide'),
        },
    });

    return message.reply({ embeds: [embed] });
}

// --------------------------------------------------
// COMMAND MODULE
// --------------------------------------------------

module.exports = {
    name: 'ttt',
    aliases: ['tictactoe', 'ttthelp'],
    description: 'Play Tic Tac Toe against another server member.',
    category: 'misc',
    usage: '$ttt <@opponent|help>',

    async execute(client, message, args) {
        if (!message.guild || !message.member) return;

        // Identify whether the user invoked the help alias.
        const firstToken =
            message.content.trim().split(/\s+/)[0] || '';

        const prefix =
            typeof client.getPrefix === 'function'
                ? client.getPrefix(message.guild.id)
                : '$';

        const invokedCommand = firstToken.startsWith(prefix)
            ? firstToken.slice(prefix.length).toLowerCase()
            : firstToken.toLowerCase().replace(/^[^a-z0-9]+/i, '');

        if (
            invokedCommand === 'ttthelp' ||
            args[0]?.toLowerCase() === 'help'
        ) {
            return showTicTacToeHelp(client, message);
        }

        // Resolve the opponent.
        const opponent = message.mentions.members.first();

        if (!opponent) {
            const embed = createGameEmbed(client, message, {
                title: '❌ Missing Opponent',
                description:
                    'Mention someone to challenge them!\n\n' +
                    `**Example:** \`${prefix}ttt @opponent\`\n` +
                    `Use \`${prefix}ttt help\` to see the game rules.`,
            });

            return message.reply({ embeds: [embed] });
        }

        // Prevent self-challenges.
        if (opponent.id === message.author.id) {
            const embed = createGameEmbed(client, message, {
                title: '❌ Invalid Opponent',
                description: 'You cannot challenge yourself!',
            });

            return message.reply({ embeds: [embed] });
        }

        // Prevent bot challenges.
        if (opponent.user.bot) {
            const embed = createGameEmbed(client, message, {
                title: '❌ Invalid Opponent',
                description:
                    'You cannot challenge a bot. Pick a human opponent!',
            });

            return message.reply({ embeds: [embed] });
        }

        // Prevent players from joining multiple games.
        if (
            activeGames.has(message.author.id) ||
            activeGames.has(opponent.id)
        ) {
            const embed = createGameEmbed(client, message, {
                title: '⚠️ Game Already Active',
                description:
                    'You or your opponent is already playing another game. ' +
                    'Finish that game first!',
            });

            return message.reply({ embeds: [embed] });
        }

        // Create game.
        const game = new TicTacToeGame(
            client,
            message,
            message.member,
            opponent
        );

        // Send the initial game board.
        const gameMessage = await message.channel.send({
            content:
                `🎮 ${message.author} challenged ${opponent} to Tic Tac Toe!`,
            embeds: [game.buildEmbed()],
            components: game.createButtons(),
        });

        // Register players.
        activeGames.set(message.author.id, game);
        activeGames.set(opponent.id, game);

        // Start the button collector.
        game.start(gameMessage);
    },
};