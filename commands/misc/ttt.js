const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');

// Tracks active games in memory.
// No database or additional handler is required.
const activeGames = new Map();

const GAME_TIMEOUT = 180_000; // 3 minutes
const GAME_COLOR = '#2b2d31';

// --------------------------------------------------
// EMBED HELPER
// --------------------------------------------------

function createGameEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(GAME_COLOR)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function getServerFooter(guild, extra = 'Tic Tac Toe') {
  return `${guild?.name || 'Server'} • ${extra}`;
}

// --------------------------------------------------
// TIC TAC TOE GAME
// --------------------------------------------------

class TicTacToeGame {
  constructor(player1, player2) {
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

    // Check the top-left to bottom-right diagonal.
    if (
      board[0][0] &&
      board[0][0] === board[1][1] &&
      board[1][1] === board[2][2]
    ) {
      this.winner = this.playerForMark(board[0][0]);
      return true;
    }

    // Check the top-right to bottom-left diagonal.
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
  // ------------------------------------------------

  buildEmbed() {
    const embed = new EmbedBuilder()
      .setColor(GAME_COLOR)
      .setTitle('✦ TIC TAC TOE ✦')
      .setTimestamp()
      .addFields(
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
        }
      );

    if (this.winner) {
      embed
        .setDescription(
          `🎉 **${this.winner.displayName} wins!**`
        )
        .addFields({
          name: 'RESULT',
          value: `${this.markFor(this.winner)} Victory!`,
        });
    } else if (this.draw) {
      embed
        .setDescription('🤝 **The game ended in a draw!**')
        .addFields({
          name: 'RESULT',
          value: 'Nobody won this round.',
        });
    } else {
      embed
        .setDescription(
          `It is **${this.currentTurn.displayName}**'s turn.`
        )
        .addFields({
          name: 'TURN',
          value:
            `${this.markFor(this.currentTurn)} ` +
            `${this.currentTurn.displayName}`,
          inline: false,
        });
    }

    embed.setFooter({
      text: getServerFooter(
        this.message?.guild,
        this.finished ? 'Game Finished' : 'Tic Tac Toe'
      ),
    });

    return embed;
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

    // Check whether this move wins the game.
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
          `You won the Tic Tac Toe game!`,
      }).catch(() => {});

      return;
    }

    // Check whether the board is full.
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

    const embed = createGameEmbed(
      '✦ TIC TAC TOE | GAME OVER ✦',
      '⌛ The game ended because nobody made a move in time.'
    ).setFooter({
      text: getServerFooter(
        this.message?.guild,
        'Game Timed Out'
      ),
    });

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

async function showTicTacToeHelp(message) {
  const embed = createGameEmbed(
    '✦ TIC TAC TOE GUIDE ✦',
    'Challenge a friend to a game of Tic Tac Toe using interactive buttons!'
  )
    .addFields(
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
      }
    )
    .setFooter({
      text: getServerFooter(message.guild, 'Game Guide'),
    });

  return message.reply({
    embeds: [embed],
  });
}

// --------------------------------------------------
// COMMAND MODULE — YOUR BOT'S EXISTING FORMAT
// --------------------------------------------------

module.exports = {
  name: 'ttt',
  aliases: ['tictactoe', 'ttthelp'],
  description: 'Play Tic Tac Toe against another server member.',
  category: 'misc',
  usage: 'ttt <@opponent|help>',

  async execute(client, message, args) {
    if (!message.guild || !message.member) return;

    // Support both "$ttt help" and the "$ttthelp" alias.
    const firstToken =
      message.content.trim().split(/\s+/)[0] || '';

    const prefix = typeof client.getPrefix === 'function'
      ? client.getPrefix(message.guild.id)
      : '$';

    const invokedCommand =
      typeof prefix === 'string' && firstToken.startsWith(prefix)
        ? firstToken.slice(prefix.length).toLowerCase()
        : firstToken.replace(/^[^a-z0-9]+/i, '').toLowerCase();

    if (
      invokedCommand === 'ttthelp' ||
      args[0]?.toLowerCase() === 'help'
    ) {
      return showTicTacToeHelp(message);
    }

    // Resolve the opponent from a Discord mention.
    const opponent = message.mentions.members.first();

    if (!opponent) {
      const embed = createGameEmbed(
        '❌ Missing Opponent',
        'Mention someone to challenge them!\n\n' +
        '**Example:** `$ttt @opponent`\n' +
        'Use `$ttt help` to see the game rules.'
      );

      return message.reply({
        embeds: [embed],
      });
    }

    if (opponent.id === message.author.id) {
      return message.reply({
        embeds: [
          createGameEmbed(
            '❌ Invalid Opponent',
            'You cannot challenge yourself!'
          ),
        ],
      });
    }

    if (opponent.user.bot) {
      return message.reply({
        embeds: [
          createGameEmbed(
            '❌ Invalid Opponent',
            'You cannot challenge a bot. Pick a human opponent!'
          ),
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
          createGameEmbed(
            '⚠️ Game Already Active',
            'You or your opponent is already playing another Tic Tac Toe game. Finish that game first!'
          ),
        ],
      });
    }

    // Create the game.
    const game = new TicTacToeGame(
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