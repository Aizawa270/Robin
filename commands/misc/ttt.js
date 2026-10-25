const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} = require('discord.js');

const { createEmbed } = require('../../handlers/universalHelper');

// Tracks active games in memory.
const activeGames = new Map();

const GAME_TIMEOUT = 180_000; // 3 minutes

// --------------------------------------------------
// UNIVERSAL HELPER EMBED
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

        // The original command message provides the guild
        // context required by UniversalHelper.
        this.commandMessage = commandMessage;

        // Both players are GuildMember objects.
        this.player1 = player1;
        this.player2 = player2;

        // Player 1 always starts as X.
        this.currentTurn = player1;

        this.board = Array.from(
            { length: 3 },
            () => Array(3).fill(null)
        );

        this.winner = null;
        this.draw = false;
        this.finished = false;

        this.message = null;
        this.collector = null;
    }

    // Return the symbol belonging to a player.
    markFor(player) {
        return player.id === this.player1.id ? '❌' : '⭕';
    }

    // Return the player who owns a symbol.
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
                        .setCustomId(`ttt_${row}_${col}`)
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

        // Check all rows.
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

        // Check all columns.
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

        // Top-left to bottom-right diagonal.
        if (
            board[0][0] &&
            board[0][0] === board[1][1] &&
            board[1][1] === board[2][2]
        ) {
            this.winner = this.playerForMark(board[0][0]);
            return true;
        }

        // Top-right to bottom-left diagonal.
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
        const boardFull = this.board.every(
            row => row.every(cell => cell !== null)
        );

        if (boardFull && !this.winner) {
            this.draw = true;
            return true;
        }

        return false;
    }

    // ------------------------------------------------
    // GAME EMBED
    // Uses UniversalHelper for the configured colour.
    // ------------------------------------------------

    buildEmbed() {
        const guild =
            this.commandMessage?.guild ||
            this.message?.guild;

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
            description = `🎉 **${this.winner.displayName} wins!**`;

            fields.push({
                name: 'RESULT',
                value: `${this.markFor(this.winner)} Victory!`,
                inline: false,
            });
        } else if (this.draw) {
            description = '🤝 **The game ended in a draw!**';

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
    // HANDLE BUTTON CLICKS
    // ------------------------------------------------

    async handleClick(interaction) {
        if (this.finished) {
            return interaction.reply({
                content: 'This game has already ended!',
                ephemeral: true,
            });
        }

        // Only the two players may interact with the board.
        const isPlayer =
            interaction.user.id === this.player1.id ||
            interaction.user.id === this.player2.id;

        if (!isPlayer) {
            return interaction.reply({
                content: 'You are not a player in this game!',
                ephemeral: true,
            });
        }

        // Only the player whose turn it is can move.
        if (interaction.user.id !== this.currentTurn.id) {
            return interaction.reply({
                content:
                    `It is **${this.currentTurn.displayName}**'s turn!`,
                ephemeral: true,
            });
        }

        const match = interaction.customId.match(
            /^ttt_([0-2])_([0-2])$/
        );

        if (!match) {
            return interaction.reply({
                content: 'That move is invalid.',
                ephemeral: true,
            });
        }

        const row = Number(match[1]);
        const col = Number(match[2]);

        // Check whether the square is already occupied.
        if (this.board[row][col] !== null) {
            return interaction.reply({
                content: 'That square is already taken!',
                ephemeral: true,
            });
        }

        // Place the player's mark.
        this.board[row][col] = this.markFor(this.currentTurn);

        // Check for a winner.
        if (this.checkWinner()) {
            this.finished = true;

            await interaction.update({
                embeds: [this.buildEmbed()],
                components: this.createButtons(true),
            });

            this.collector.stop('finished');

            await interaction.followUp({
                content:
                    `🎉 Congratulations ${this.winner}! ` +
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

            this.collector.stop('finished');

            await interaction.followUp({
                content: '🤝 The Tic Tac Toe game ended in a draw!',
            }).catch(() => {});

            return;
        }

        // Switch turns.
        this.currentTurn =
            this.currentTurn.id === this.player1.id
                ? this.player2
                : this.player1;

        // Update the board and current turn.
        await interaction.update({
            embeds: [this.buildEmbed()],
            components: this.createButtons(),
        });
    }

    // ------------------------------------------------
    // GAME TIMEOUT
    // ------------------------------------------------

    async onTimeout() {
        if (this.finished) return;

        this.finished = true;

        const guild =
            this.commandMessage?.guild ||
            this.message?.guild;

        const embed = createGameEmbed(
            this.client,
            this.commandMessage,
            {
                title: '✦ TIC TAC TOE | GAME OVER ✦',
                description:
                    '⌛ The game ended because nobody made a move in time.',
                footer: {
                    text: getServerFooter(guild, 'Game Timed Out'),
                },
            }
        );

        await this.message.edit({
            embeds: [embed],
            components: this.createButtons(true),
        }).catch(() => {});
    }

    // ------------------------------------------------
    // START GAME COLLECTOR
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

                // Avoid leaving an interaction unanswered.
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

            // Allow both players to start another game.
            activeGames.delete(this.player1.id);
            activeGames.delete(this.player2.id);
        });
    }
}

// --------------------------------------------------
// HELP COMMAND
// --------------------------------------------------

async function showTicTacToeHelp(client, message) {
    const embed = createGameEmbed(client, message, {
        title: '✦ TIC TAC TOE GUIDE ✦',
        description:
            'Challenge a friend to Tic Tac Toe using interactive buttons!',
        fields: [
            {
                name: '🎮 Start a Game',
                value: '`$ttt @opponent`',
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
                    '`$ttt @user` — Start a game\n' +
                    '`$ttt help` — Show this guide\n' +
                    '`$ttthelp` — Show this guide',
                inline: false,
            },
        ],
        footer: {
            text: getServerFooter(message.guild, 'Game Guide'),
        },
    });

    return message.reply({
        embeds: [embed],
    });
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

        // Determine which command was invoked.
        const firstToken =
            message.content.trim().split(/\s+/)[0] || '';

        const prefix =
            typeof client.getPrefix === 'function'
                ? client.getPrefix(message.guild.id)
                : '$';

        const invokedCommand =
            typeof prefix === 'string' && firstToken.startsWith(prefix)
                ? firstToken.slice(prefix.length).toLowerCase()
                : firstToken.replace(/^[^a-z0-9]+/i, '').toLowerCase();

        // Support "$ttt help" and the "$ttthelp" alias.
        if (
            invokedCommand === 'ttthelp' ||
            args[0]?.toLowerCase() === 'help'
        ) {
            return showTicTacToeHelp(client, message);
        }

        // Resolve the opponent from a Discord mention.
        const opponent = message.mentions.members.first();

        if (!opponent) {
            const embed = createGameEmbed(client, message, {
                title: '❌ Missing Opponent',
                description:
                    'Mention someone to challenge them!\n\n' +
                    '**Example:** `$ttt @opponent`\n' +
                    'Use `$ttt help` to see the game rules.',
            });

            return message.reply({
                embeds: [embed],
            });
        }

        if (opponent.id === message.author.id) {
            return message.reply({
                embeds: [
                    createGameEmbed(client, message, {
                        title: '❌ Invalid Opponent',
                        description: 'You cannot challenge yourself!',
                    }),
                ],
            });
        }

        if (opponent.user.bot) {
            return message.reply({
                embeds: [
                    createGameEmbed(client, message, {
                        title: '❌ Invalid Opponent',
                        description:
                            'You cannot challenge a bot. Pick a human opponent!',
                    }),
                ],
            });
        }

        // Prevent either player from joining multiple games at once.
        if (
            activeGames.has(message.author.id) ||
            activeGames.has(opponent.id)
        ) {
            return message.reply({
                embeds: [
                    createGameEmbed(client, message, {
                        title: '⚠️ Game Already Active',
                        description:
                            'You or your opponent is already playing another ' +
                            'Tic Tac Toe game. Finish that game first!',
                    }),
                ],
            });
        }

        // Create the game and give it the UniversalHelper context.
        const game = new TicTacToeGame(
            client,
            message,
            message.member,
            opponent
        );

        // Send the initial board.
        const gameMessage = await message.channel.send({
            content:
                `🎮 ${message.author} challenged ${opponent} to Tic Tac Toe!`,
            embeds: [game.buildEmbed()],
            components: game.createButtons(),
        });

        // Register the players as busy.
        activeGames.set(message.author.id, game);
        activeGames.set(opponent.id, game);

        // Start listening for button interactions.
        game.start(gameMessage);
    },
};