const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

const farm = require('../../handlers/farmService');
const { emoji, seedEmoji } = require('../../handlers/farmEmojis');

const { FarmError, CFG } = farm;

const THEME_COLOR = '#5b0000';
const SESSION_MS = 3 * 60 * 1000;
const PAGE_SIZE = { plots: 10, inv: 12, seeds: 8 };

// Per-player rate limit.
const lastUse = new Map();

// ============================================================
// FORMATTING HELPERS
// ============================================================

const money = amount => farm.money(amount);
const num = n => Number(n || 0).toLocaleString('en-US');

function dur(ms) {
  ms = Math.max(0, Number(ms) || 0);
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function bar(pct, size = 10) {
  const filled = Math.max(0, Math.min(size, Math.round((pct / 100) * size)));
  return '▰'.repeat(filled) + '▱'.repeat(size - filled);
}

const stamp = ms => `<t:${Math.floor(ms / 1000)}:R>`;

function paginate(items, size, page) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { slice: items.slice(current * size, current * size + size), page: current, pages };
}

function mkEmbed(message, data = {}) {
  let embed;

  if (typeof message.createEmbed === 'function') {
    embed = message.createEmbed({
      title: data.title,
      description: data.description,
      fields: data.fields,
      footer: data.footer,
      thumbnail: data.thumbnail,
    });
  } else {
    embed = new EmbedBuilder().setColor(THEME_COLOR);
    if (data.title) embed.setTitle(data.title);
    if (data.description) embed.setDescription(data.description);
    if (data.fields?.length) embed.addFields(data.fields);
    if (data.footer) embed.setFooter({ text: data.footer });
    if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  }

  return embed;
}

const field = (name, value, inline = false) => ({
  name,
  value: String(value || '-').slice(0, 1024),
  inline,
});

function avatar(ctx) {
  return ctx.message.author.displayAvatarURL({ size: 256 });
}

function plotLine(p) {
  const n = String(p.plotNo).padStart(2, ' ');
  if (p.empty) return `\`${n}\` Empty`;
  const e = emoji(p.cropId);
  if (p.ready) return `\`${n}\` ${e}**${p.name}** - Ready to harvest`;
  return `\`${n}\` ${e}**${p.name}** ${bar(p.pct, 8)} ${p.pct}% - ${dur(p.remainingMs)}`;
}

function progressLines(notes = {}) {
  const out = [];

  for (const l of notes.levelUps || []) {
    out.push(
      `**Level up.** You reached farming level ${l.level}.` +
      (l.unlocks.length ? ` Unlocked: ${l.unlocks.join(', ')}.` : '')
    );
  }
  for (const q of notes.quests || []) {
    out.push(`Quest complete: ${q.text} (+${money(q.coins)}, +${num(q.xp)} XP)`);
  }
  if (notes.questBonus) {
    out.push(`All daily quests complete (+${money(notes.questBonus.coins)}, +${num(notes.questBonus.xp)} XP)`);
  }
  for (const a of notes.achievements || []) {
    out.push(`Achievement unlocked: **${a.name}** (+${money(a.coins)}${a.xp ? `, +${num(a.xp)} XP` : ''})`);
  }

  return out.slice(0, 8);
}

function withProgress(fields, notes) {
  const lines = progressLines(notes);
  if (lines.length) fields.push(field('Progress', lines.join('\n')));
  return fields;
}

// ============================================================
// HELP
// ============================================================

function helpEmbed(ctx) {
  const line = (cmd, text) => `\`${cmd}\`\n${text}`;

  return mkEmbed(ctx.message, {
    title: 'Farm',
    description:
      'Grow crops in real time, sell your produce and expand your farm. ' +
      'Crops keep growing while you are offline and never die.',
    fields: [
      field('Overview', [
        line('$farm', 'Farm dashboard'),
        line('$farm plots', 'Every plot and its growth'),
        line('$farm inventory', 'Seeds, produce, supplies and tools'),
        line('$farm stats', 'Your farming statistics'),
        line('$farm leaderboard', 'Top farmers'),
      ].join('\n')),
      field('Growing', [
        line('$farm plant <crop> [amount|max]', 'Plant seeds in empty plots'),
        line('$farm harvest [plot|all]', 'Collect finished crops'),
        line('$farm fertilize <plot> [type]', 'Shorten the remaining grow time'),
      ].join('\n')),
      field('Economy', [
        line('$farm shop', 'Seeds, tools, supplies and decorations'),
        line('$farm buy <item> [amount]', 'Buy from the shop'),
        line('$farm sell <crop> [amount|all]', 'Sell produce'),
        line('$farm sell all', 'Sell all produce'),
        line('$farm market', 'Current prices and events'),
        line('$farm upgrade', 'Expand your farm'),
      ].join('\n')),
      field('Progress', [
        line('$farm quests', 'Daily quests and contracts'),
        line('$farm deliver <number>', 'Deliver produce to a contract'),
      ].join('\n')),
    ],
    footer: 'Buying uses your Crowns balance',
  });
}

// ============================================================
// RESULT EMBEDS (one-shot commands)
// ============================================================

function plantEmbed(ctx, r) {
  const n = r.planted.length;
  const fields = [
    field('Plots', r.planted.join(', '), true),
    field('Ready In', dur(r.growMs), true),
    field('Seeds Left', num(r.seedsLeft), true),
  ];
  withProgress(fields, r.notes);

  return mkEmbed(ctx.message, {
    title: 'Planted',
    description:
      `You planted ${emoji(r.crop.id)}**${r.crop.name}** on ${n} plot${n === 1 ? '' : 's'}.` +
      (r.rain ? '\nThe rain is speeding up growth.' : ''),
    fields,
    thumbnail: avatar(ctx),
  });
}

function harvestEmbed(ctx, r) {
  const lines = r.harvested.map(e =>
    `${emoji(e.crop.id)}**${e.crop.name}** x${num(e.units)} from ${e.plots} plot${e.plots === 1 ? '' : 's'}` +
    (e.bonus ? ` (${e.bonus} bonus)` : '')
  );

  const fields = [field('Farming XP', `+${num(r.xp)}${r.festival ? ' (Harvest Festival)' : ''}`, true)];

  const dropNames = Object.entries(r.drops).map(([id, qty]) => {
    const f = CFG.FERTILIZERS.find(x => x.id === id);
    return `${emoji(`fert_${id}`)}${f?.name || id} x${qty}`;
  });
  if (dropNames.length) fields.push(field('Bonus Items', dropNames.join('\n'), true));

  withProgress(fields, r.notes);

  return mkEmbed(ctx.message, {
    title: 'Harvest',
    description:
      `${lines.join('\n')}\n\n` +
      'Produce is stored in your inventory. Sell it with `$farm sell`.' +
      (r.pollination ? '\nPollination Season boosted your berries.' : ''),
    fields,
    thumbnail: avatar(ctx),
  });
}

function sellEmbed(ctx, r) {
  const fields = [
    field('Price Each', money(r.unit), true),
    field('Total', money(r.total), true),
    field('Balance', money(r.balance), true),
  ];
  withProgress(fields, r.notes);

  return mkEmbed(ctx.message, {
    title: 'Sold',
    description: `You sold ${emoji(r.crop.id)}**${r.crop.name}** x${num(r.amount)}.`,
    fields,
    thumbnail: avatar(ctx),
  });
}

function sellAllEmbed(ctx, r) {
  const fields = [
    field('Total', money(r.total), true),
    field('Balance', money(r.balance), true),
  ];
  withProgress(fields, r.notes);

  return mkEmbed(ctx.message, {
    title: 'Sold Everything',
    description: r.lines
      .map(l => `${emoji(l.crop.id)}**${l.crop.name}** x${num(l.qty)} for ${money(l.total)}`)
      .join('\n'),
    fields,
    thumbnail: avatar(ctx),
  });
}

function buyEmbed(ctx, r) {
  const e = r.item.kind === 'seed' ? seedEmoji(r.item.id)
    : r.item.kind === 'fert' ? emoji(`fert_${r.item.id}`)
    : emoji(r.item.id);

  return mkEmbed(ctx.message, {
    title: 'Purchased',
    description: `You bought ${e}**${r.item.name}** x${num(r.qty)}.`,
    fields: [
      field('Cost', r.total > 0 ? money(r.total) : 'Free', true),
      field('Balance', money(r.balance), true),
    ],
    thumbnail: avatar(ctx),
  });
}

function upgradeDoneEmbed(ctx, r) {
  return mkEmbed(ctx.message, {
    title: 'Farm Expanded',
    description: `Your farm is now a **${r.expansion.name}** with **${r.expansion.plots} plots**. Your crops were not touched.`,
    fields: withProgress([field('Balance', money(r.balance))], r.notes),
    thumbnail: avatar(ctx),
  });
}

function fertilizeEmbed(ctx, r) {
  return mkEmbed(ctx.message, {
    title: 'Fertilized',
    description:
      `You used ${emoji(`fert_${r.fert.id}`)}**${r.fert.name}** on plot ${r.plotNo} (${emoji(r.crop.id)}${r.crop.name}).`,
    fields: [
      field('Time Saved', dur(r.savedMs), true),
      field('Ready In', dur(r.remainingMs), true),
      field('Applications', `${r.applications}/${CFG.MAX_FERT_PER_PLOT}`, true),
    ],
    thumbnail: avatar(ctx),
  });
}

function deliverEmbed(ctx, r) {
  const fields = [field('Progress', `${num(r.total)} / ${num(r.target)}`, true)];

  if (r.completed) {
    fields.push(field('Reward', `${money(r.coins)}\n+${num(r.xp)} XP`, true));
  }
  withProgress(fields, r.notes);

  return mkEmbed(ctx.message, {
    title: r.completed ? 'Contract Complete' : 'Delivery Made',
    description: `You delivered ${emoji(r.crop.id)}**${r.crop.name}** x${num(r.delivered)} to ${r.client}.`,
    fields,
    thumbnail: avatar(ctx),
  });
}

function errorEmbed(ctx, text) {
  return mkEmbed(ctx.message, { title: 'Farm', description: text });
}

// ============================================================
// SESSION VIEWS (interactive menu)
// ============================================================

const VIEWS = [
  { value: 'dash', label: 'Dashboard' },
  { value: 'plots', label: 'Plots' },
  { value: 'inv', label: 'Inventory' },
  { value: 'shop', label: 'Shop' },
  { value: 'market', label: 'Market' },
  { value: 'quests', label: 'Quests and Contracts' },
  { value: 'stats', label: 'Statistics' },
  { value: 'lb', label: 'Leaderboard' },
];

const SHOP_CATS = [
  { value: 'seeds', label: 'Seeds' },
  { value: 'tools', label: 'Tools' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'decor', label: 'Decorations' },
];

const LB_TYPES = [
  { value: 'level', label: 'Level' },
  { value: 'earnings', label: 'Earnings' },
  { value: 'harvested', label: 'Harvested' },
  { value: 'value', label: 'Farm Value' },
  { value: 'contracts', label: 'Contracts' },
];

const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);

const rowOf = (...components) => new ActionRowBuilder().addComponents(...components);

function navRow(state) {
  return rowOf(
    new StringSelectMenuBuilder()
      .setCustomId('fm:nav')
      .setPlaceholder('Open a section')
      .addOptions(VIEWS.map(v => ({ label: v.label, value: v.value, default: v.value === state.view })))
  );
}

function pageButtons(page, pages, ...extra) {
  return rowOf(
    btn('fm:prev', 'Previous', ButtonStyle.Secondary, page <= 0),
    btn('fm:next', 'Next', ButtonStyle.Secondary, page >= pages - 1),
    ...extra
  );
}

// ---------- Dashboard ----------

function dashView(ctx, state) {
  const d = farm.getDashboard(ctx.gid, ctx.uid);
  const p = d.player;

  const head = [];
  if (state.welcome) {
    head.push(`Welcome to your farm. You received ${money(state.welcome)} to get started.`, '');
  }
  head.push(`**Level ${p.level}** - ${d.title}`);
  head.push(
    d.xpNeeded
      ? `${bar((p.xp / d.xpNeeded) * 100, 12)} ${num(p.xp)} / ${num(d.xpNeeded)} XP`
      : 'Maximum level reached'
  );

  const shown = d.plots.slice(0, 10).map(plotLine);
  const more = d.plots.length > 10 ? `\n...and ${d.plots.length - 10} more. Open the Plots section.` : '';

  const gear = [`${emoji(d.can.id)}${d.can.name} (${Math.round(d.can.bonus * 100)}% faster)`];
  gear.push(d.hoe ? `${emoji(d.hoe.id)}${d.hoe.name} (${Math.round(d.hoe.chance * 100)}% bonus)` : 'No hoe');

  const fields = [
    field('Wallet', money(d.wallet), true),
    field('Farm Value', money(d.value), true),
    field('Plots', `${d.used} / ${d.plots.length} in use\n${d.ready} ready`, true),
    field('Your Plots', shown.join('\n') + more),
    field('Equipment', gear.join('\n'), true),
  ];

  if (d.decor.length) {
    fields.push(field('Decorations', d.decor.map(x => `${emoji(x.id)}${x.name}`).join('\n'), true));
  }
  if (d.event) {
    fields.push(field(d.event.name, `${d.event.text}\nEnds ${stamp(d.event.endsAt)}`));
  }

  return {
    embed: mkEmbed(ctx.message, {
      title: `${ctx.message.author.username}'s Farm`,
      description: head.join('\n'),
      fields,
      thumbnail: avatar(ctx),
      footer: 'Crops keep growing while you are offline',
    }),
    rows: [rowOf(
      btn('fm:harvest', 'Harvest All', ButtonStyle.Success, d.ready === 0),
      btn('fm:refresh', 'Refresh')
    )],
  };
}

// ---------- Plots ----------

function plotsView(ctx, state) {
  const d = farm.getDashboard(ctx.gid, ctx.uid);
  const { slice, page, pages } = paginate(d.plots, PAGE_SIZE.plots, state.page);
  state.page = page;

  return {
    embed: mkEmbed(ctx.message, {
      title: 'Plots',
      description: slice.map(plotLine).join('\n'),
      footer: `Page ${page + 1} of ${pages}  |  ${d.used}/${d.plots.length} in use, ${d.ready} ready`,
      thumbnail: avatar(ctx),
    }),
    rows: [pageButtons(page, pages, btn('fm:harvest', 'Harvest All', ButtonStyle.Success, d.ready === 0))],
  };
}

// ---------- Inventory ----------

function inventoryLines(ctx) {
  const d = farm.getDashboard(ctx.gid, ctx.uid);
  const inv = farm.inventorySections(ctx.gid, ctx.uid);
  const lines = [];

  const section = (title, items) => {
    if (!items.length) return;
    lines.push(`__**${title}**__`, ...items, '');
  };

  section('Seeds', inv.seeds);
  section('Produce', inv.produce);
  section('Supplies', inv.supplies);
  section('Tools', [
    `${emoji(d.can.id)}${d.can.name}`,
    ...(d.hoe ? [`${emoji(d.hoe.id)}${d.hoe.name}`] : []),
  ]);
  section('Decorations', d.decor.map(x => `${emoji(x.id)}${x.name}`));

  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return { lines, inv };
}

function invView(ctx, state) {
  const { lines, inv } = inventoryLines(ctx);
  const { slice, page, pages } = paginate(lines, PAGE_SIZE.inv + 4, state.page);
  state.page = page;

  return {
    embed: mkEmbed(ctx.message, {
      title: `${ctx.message.author.username}'s Farm Inventory`,
      description: slice.join('\n') || 'Nothing here yet. Visit the shop for seeds.',
      footer: `Page ${page + 1} of ${pages}  |  Produce value: ${num(inv.produceValue)} Crowns`,
      thumbnail: avatar(ctx),
    }),
    rows: [pageButtons(page, pages, btn('fm:sellall', 'Sell All Produce', ButtonStyle.Primary, inv.produce.length === 0))],
  };
}

// ---------- Shop ----------

function shopView(ctx, state) {
  const d = farm.getDashboard(ctx.gid, ctx.uid);
  const level = d.player.level;
  const lock = req => (level < req ? ` - requires level ${req}` : '');
  let lines = [];
  let title = 'Shop';

  if (state.cat === 'seeds') {
    title = 'Shop - Seeds';
    lines = CFG.CROPS.map(c =>
      `${seedEmoji(c.id)}**${c.name} Seeds** - ${money(c.seedCost)}${lock(c.level)}\n` +
      `Grows in ${dur(c.growMs)}, yields ${c.yield[0]}-${c.yield[1]}, sells for about ${money(c.price)}`
    );
  } else if (state.cat === 'tools') {
    title = 'Shop - Tools';
    lines = [
      ...CFG.WATERING_CANS.filter(t => t.cost > 0).map(t =>
        `${emoji(t.id)}**${t.name}** - ${money(t.cost)}${lock(t.level)}\nCrops grow ${Math.round(t.bonus * 100)}% faster${d.player.can_tier >= t.tier ? ' (owned)' : ''}`
      ),
      ...CFG.HOES.map(t =>
        `${emoji(t.id)}**${t.name}** - ${money(t.cost)}${lock(t.level)}\n${Math.round(t.chance * 100)}% chance of bonus produce per plot${d.player.hoe_tier >= t.tier ? ' (owned)' : ''}`
      ),
    ];
  } else if (state.cat === 'supplies') {
    title = 'Shop - Supplies';
    lines = CFG.FERTILIZERS.map(f =>
      `${emoji(`fert_${f.id}`)}**${f.name}** - ${money(f.cost)}${lock(f.level)}\nRemoves ${Math.round(f.cut * 100)}% of the remaining grow time (max ${CFG.MAX_FERT_PER_PLOT} per plot)`
    );
  } else {
    title = 'Shop - Decorations';
    const owned = new Set(d.decor.map(x => x.id));
    lines = CFG.DECORATIONS.map(x =>
      `${emoji(x.id)}**${x.name}** - ${money(x.cost)}${owned.has(x.id) ? ' (owned)' : lock(x.level)}\nCosmetic`
    );
  }

  const size = state.cat === 'seeds' ? PAGE_SIZE.seeds : 20;
  const { slice, page, pages } = paginate(lines, size, state.page);
  state.page = page;

  return {
    embed: mkEmbed(ctx.message, {
      title,
      description: slice.join('\n\n') + '\n\nBuy with `$farm buy <item> [amount]`',
      footer: `Page ${page + 1} of ${pages}  |  Balance: ${num(d.wallet)} Crowns`,
      thumbnail: avatar(ctx),
    }),
    rows: [
      rowOf(
        new StringSelectMenuBuilder()
          .setCustomId('fm:cat')
          .setPlaceholder('Shop category')
          .addOptions(SHOP_CATS.map(c => ({ label: c.label, value: c.value, default: c.value === state.cat })))
      ),
      pageButtons(page, pages),
    ],
  };
}

// ---------- Market ----------

function marketView(ctx) {
  const m = farm.getMarket(ctx.gid);
  const tiers = ['Beginner', 'Intermediate', 'Advanced', 'Rare'];

  const fields = tiers.map(t => field(
    t,
    CFG.CROPS.filter(c => c.tier === t).map(c => {
      const price = farm.unitPrice(c, m);
      const diff = Math.round((price / c.price - 1) * 100);
      return `${emoji(c.id)}**${c.name}** ${money(price)} (${diff >= 0 ? '+' : ''}${diff}%)`;
    }).join('\n'),
    true
  ));

  const lines = [`Prices change every few hours. Next update ${stamp(m.nextUpdateAt)}.`];
  if (m.event) {
    lines.push('', `**${m.event.name}** - ${m.event.text}`);
    if (m.event.id === 'market_boom' && m.event.detail?.crops?.length) {
      lines.push(`Boosted: ${m.event.detail.crops.map(id => farm.cropMap.get(id)?.name).filter(Boolean).join(', ')}`);
    }
    lines.push(`Ends ${stamp(m.event.endsAt)}`);
  }

  return {
    embed: mkEmbed(ctx.message, {
      title: 'Market',
      description: lines.join('\n'),
      fields,
      thumbnail: avatar(ctx),
    }),
    rows: [rowOf(btn('fm:refresh', 'Refresh'))],
  };
}

// ---------- Quests and contracts ----------

function questsView(ctx) {
  const b = farm.getQuestBoard(ctx.gid, ctx.uid);
  const now = Date.now();
  const tzOffset = 6 * 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  const nextDay = (Math.floor((now + tzOffset) / dayMs) + 1) * dayMs - tzOffset;

  const questLines = b.quests.map((q, i) =>
    `**${i + 1}.** ${farm.questText(q)}\n` +
    `${q.done ? 'Complete' : `${num(q.progress)} / ${num(q.target)}`} - ${money(q.reward_coins)}, ${num(q.reward_xp)} XP`
  );

  const contractLines = b.contracts.map((c, i) => {
    const crop = farm.cropMap.get(c.crop_id);
    return (
      `**${i + 1}.** ${emoji(c.crop_id)}${c.target} ${crop?.name || c.crop_id} for ${farm.contractClient(c)}\n` +
      `${c.done ? 'Complete' : `${num(c.delivered)} / ${num(c.target)} delivered`} - ${money(c.reward_coins)}, ${num(c.reward_xp)} XP`
    );
  });

  return {
    embed: mkEmbed(ctx.message, {
      title: 'Quests and Contracts',
      fields: [
        field(
          'Daily Quests',
          `${questLines.join('\n')}\n\nBonus for all three: ${money(b.bonusCoins)}, ${b.bonusXp} XP${b.bonusClaimed ? ' (claimed)' : ''}\nResets ${stamp(nextDay)}`
        ),
        field(
          'Contracts',
          `${contractLines.join('\n') || 'No contracts available.'}\n\nDeliver with \`$farm deliver <number>\`\nNew contracts ${stamp(b.contractsResetAt)}`
        ),
      ],
      thumbnail: avatar(ctx),
    }),
    rows: [rowOf(btn('fm:refresh', 'Refresh'))],
  };
}

// ---------- Stats ----------

function statsView(ctx) {
  const s = farm.getStats(ctx.gid, ctx.uid);
  const p = s.player;

  const ach = s.achievements
    .map(a => `${a.earned ? '**' : ''}${a.name}${a.earned ? '**' : ''} - ${a.desc}${a.earned ? ' (done)' : ''}`)
    .join('\n');

  return {
    embed: mkEmbed(ctx.message, {
      title: `${ctx.message.author.username}'s Farming Stats`,
      description: `**Level ${p.level}** - ${s.title}`,
      fields: [
        field('Harvested', `${num(p.crops_harvested)} produce\n${num(p.plots_harvested)} plots`, true),
        field('Money', `Earned ${money(p.total_earned)}\nSpent ${money(p.total_spent)}`, true),
        field('Farm', `${p.plots} plots\nValue ${money(s.value)}`, true),
        field('Completed', `${num(p.contracts_done)} contracts\n${num(p.quests_done)} daily quests`, true),
        field('Titles', s.titles.join(', '), true),
        field('Achievements', ach),
      ],
      thumbnail: avatar(ctx),
    }),
    rows: [],
  };
}

// ---------- Leaderboard ----------

function lbView(ctx, state) {
  const rows = farm.leaderboard(ctx.gid, state.lb, 10);
  const asMoney = state.lb === 'earnings' || state.lb === 'value';
  const label = LB_TYPES.find(t => t.value === state.lb)?.label || 'Level';

  const lines = rows.map((r, i) =>
    `**${i + 1}.** <@${r.userId}> - ${asMoney ? money(r.value) : state.lb === 'level' ? `Level ${r.value}` : num(r.value)}`
  );

  return {
    embed: mkEmbed(ctx.message, {
      title: `Farming Leaderboard - ${label}`,
      description: lines.join('\n') || 'No farmers yet.',
      thumbnail: ctx.message.guild.iconURL?.({ size: 256 }) || avatar(ctx),
    }),
    rows: [rowOf(...LB_TYPES.map(t => btn(`fm:lb:${t.value}`, t.label, t.value === state.lb ? ButtonStyle.Primary : ButtonStyle.Secondary)))],
  };
}

// ---------- Upgrade + sell-all confirmation ----------

function upgradeView(ctx) {
  const d = farm.getDashboard(ctx.gid, ctx.uid);
  const next = farm.nextExpansion(d.player);

  if (!next) {
    return {
      embed: mkEmbed(ctx.message, {
        title: 'Expand Your Farm',
        description: `You own the **${CFG.EXPANSIONS[d.player.expansion_tier].name}** with ${d.player.plots} plots, the largest farm available.`,
      }),
      rows: [],
    };
  }

  return {
    embed: mkEmbed(ctx.message, {
      title: 'Expand Your Farm',
      description: 'Expanding adds plots. Your existing crops are never removed.',
      fields: [
        field('Current', `${CFG.EXPANSIONS[d.player.expansion_tier].name}\n${d.player.plots} plots`, true),
        field('Next', `${next.name}\n${next.plots} plots`, true),
        field('Cost', money(next.cost), true),
        field('Your Balance', money(d.wallet), true),
      ],
      thumbnail: avatar(ctx),
    }),
    rows: [rowOf(
      btn('fm:upyes', 'Confirm Upgrade', ButtonStyle.Success, d.wallet < next.cost),
      btn('fm:cancel', 'Cancel', ButtonStyle.Secondary)
    )],
  };
}

function sellConfirmView(ctx) {
  const pre = farm.sellAllPreview(ctx.gid, ctx.uid);

  if (!pre.lines.length) {
    return {
      embed: mkEmbed(ctx.message, { title: 'Sell All', description: 'You have no produce to sell.' }),
      rows: [rowOf(btn('fm:cancel', 'Back'))],
    };
  }

  return {
    embed: mkEmbed(ctx.message, {
      title: 'Sell All Produce',
      description:
        pre.lines.map(l => `${emoji(l.crop.id)}**${l.crop.name}** x${num(l.qty)} - ${money(l.total)}`).join('\n') +
        `\n\n**Total: ${money(pre.total)}**\nProduce kept for contracts will be sold too.`,
      thumbnail: avatar(ctx),
    }),
    rows: [rowOf(
      btn('fm:sellyes', 'Confirm Sale', ButtonStyle.Success),
      btn('fm:cancel', 'Cancel', ButtonStyle.Secondary)
    )],
  };
}

// ============================================================
// SESSION RENDER + COLLECTOR
// ============================================================

function render(ctx, state) {
  let view;

  switch (state.view) {
    case 'plots': view = plotsView(ctx, state); break;
    case 'inv': view = invView(ctx, state); break;
    case 'shop': view = shopView(ctx, state); break;
    case 'market': view = marketView(ctx, state); break;
    case 'quests': view = questsView(ctx, state); break;
    case 'stats': view = statsView(ctx, state); break;
    case 'lb': view = lbView(ctx, state); break;
    case 'upgrade': view = upgradeView(ctx, state); break;
    case 'sellconfirm': view = sellConfirmView(ctx, state); break;
    case 'result':
      view = { embed: state.result, rows: [rowOf(btn('fm:back', 'Back to Farm'))] };
      break;
    default: view = dashView(ctx, state);
  }

  const components = [];
  if (VIEWS.some(v => v.value === state.view)) components.push(navRow(state));
  components.push(...view.rows);

  return { embeds: [view.embed], components: components.slice(0, 5) };
}

async function startSession(ctx, view, extra = {}) {
  const opened = farm.openFarm(ctx.gid, ctx.uid);

  const state = {
    view,
    page: 0,
    cat: extra.cat || 'seeds',
    lb: extra.lb || 'level',
    welcome: opened.created ? opened.grant : null,
    result: null,
  };

  const sent = await ctx.message.reply(render(ctx, state));
  state.welcome = null;

  const collector = sent.createMessageComponentCollector({ time: SESSION_MS });

  collector.on('collect', async interaction => {
    if (interaction.user.id !== ctx.uid) {
      return interaction.reply({ content: 'This is not your farm menu.', ephemeral: true }).catch(() => {});
    }

    try {
      const id = interaction.customId;

      if (id === 'fm:nav') {
        state.view = interaction.values[0];
        state.page = 0;
      } else if (id === 'fm:cat') {
        state.cat = interaction.values[0];
        state.page = 0;
      } else if (id === 'fm:prev') {
        state.page = Math.max(0, state.page - 1);
      } else if (id === 'fm:next') {
        state.page += 1;
      } else if (id === 'fm:harvest') {
        state.result = harvestEmbed(ctx, farm.harvest(ctx.gid, ctx.uid));
        state.view = 'result';
      } else if (id === 'fm:sellall') {
        state.view = 'sellconfirm';
      } else if (id === 'fm:sellyes') {
        state.result = sellAllEmbed(ctx, farm.sellAll(ctx.gid, ctx.uid));
        state.view = 'result';
      } else if (id === 'fm:upyes') {
        state.result = upgradeDoneEmbed(ctx, farm.upgrade(ctx.gid, ctx.uid));
        state.view = 'result';
      } else if (id === 'fm:cancel' || id === 'fm:back') {
        state.view = 'dash';
      } else if (id.startsWith('fm:lb:')) {
        state.lb = id.slice(6);
      }
      // fm:refresh just re-renders.

      await interaction.update(render(ctx, state));
    } catch (error) {
      if (error instanceof FarmError) {
        await interaction.reply({ content: error.message, ephemeral: true }).catch(() => {});
        // Refresh the menu so stale buttons (e.g. nothing to harvest) update.
        await sent.edit(render(ctx, state)).catch(() => {});
      } else {
        console.error('[Farm] Interaction error:', error);
        await interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
      }
    }
  });

  collector.on('end', () => {
    sent.edit({ components: [] }).catch(() => {});
  });
}

// ============================================================
// ARGUMENT PARSING
// ============================================================

function splitAmount(tokens) {
  const last = String(tokens[tokens.length - 1] || '').toLowerCase();
  if (tokens.length > 1 && (/^\d+$/.test(last) || last === 'max' || last === 'all')) {
    return { query: tokens.slice(0, -1).join(' '), amount: last };
  }
  return { query: tokens.join(' '), amount: null };
}

const toAmount = (raw, fallback) => {
  if (raw === null || raw === undefined) return fallback;
  if (raw === 'max' || raw === 'all') return raw;
  return Number(raw);
};

// ============================================================
// COMMAND ROUTER
// ============================================================

async function route(ctx, sub, rest) {
  const { message } = ctx;

  switch (sub) {
    case '':
    case 'dashboard':
    case 'dash':
    case 'view':
    case 'status':
      return startSession(ctx, 'dash');

    case 'help':
    case 'commands':
      return message.reply({ embeds: [helpEmbed(ctx)] });

    case 'plots':
    case 'plot':
      return startSession(ctx, 'plots');

    case 'inventory':
    case 'inv':
    case 'items':
      return startSession(ctx, 'inv');

    case 'shop':
    case 'store': {
      const cat = SHOP_CATS.find(c => c.value === String(rest[0] || '').toLowerCase())?.value;
      return startSession(ctx, 'shop', { cat });
    }

    case 'market':
    case 'prices':
      return startSession(ctx, 'market');

    case 'quests':
    case 'quest':
    case 'contracts':
    case 'contract':
      return startSession(ctx, 'quests');

    case 'stats':
    case 'stat':
    case 'profile':
      return startSession(ctx, 'stats');

    case 'leaderboard':
    case 'lb':
    case 'top': {
      const lb = LB_TYPES.find(t => t.value === String(rest[0] || '').toLowerCase())?.value;
      return startSession(ctx, 'lb', { lb });
    }

    case 'upgrade':
    case 'expand':
      farm.openFarm(ctx.gid, ctx.uid);
      return startSession(ctx, 'upgrade');

    case 'plant':
    case 'sow': {
      if (!rest.length) throw new FarmError('Use `$farm plant <crop> [amount|max]`.');
      const { query, amount } = splitAmount(rest);
      const crop = farm.resolveCrop(query);
      if (!crop) throw new FarmError(`I do not know a crop called "${query}". See \`$farm shop\`.`);
      const result = farm.plant(ctx.gid, ctx.uid, crop.id, toAmount(amount, 1));
      return message.reply({ embeds: [plantEmbed(ctx, result)] });
    }

    case 'harvest':
    case 'collect':
    case 'reap': {
      const arg = String(rest[0] || 'all').toLowerCase();
      let plotNo = null;
      if (arg !== 'all') {
        if (!/^\d+$/.test(arg)) throw new FarmError('Use `$farm harvest [plot number|all]`.');
        plotNo = Number(arg);
      }
      const result = farm.harvest(ctx.gid, ctx.uid, plotNo);
      return message.reply({ embeds: [harvestEmbed(ctx, result)] });
    }

    case 'fertilize':
    case 'fertilise':
    case 'fert': {
      if (!rest.length) throw new FarmError('Use `$farm fertilize <plot> [basic|advanced|premium]`.');
      const type = rest[1] ? String(rest[1]).toLowerCase().replace('fertilizer', '') : null;
      const result = farm.fertilize(ctx.gid, ctx.uid, rest[0], type || null);
      return message.reply({ embeds: [fertilizeEmbed(ctx, result)] });
    }

    case 'buy':
    case 'purchase': {
      if (!rest.length) throw new FarmError('Use `$farm buy <item> [amount]`. See `$farm shop`.');
      const { query, amount } = splitAmount(rest);
      const item = farm.resolveShopItem(query);
      if (!item) throw new FarmError(`I could not find "${query}" in the shop.`);
      const result = farm.buy(ctx.gid, ctx.uid, item, toAmount(amount === 'all' || amount === 'max' ? null : amount, 1));
      return message.reply({ embeds: [buyEmbed(ctx, result)] });
    }

    case 'sell': {
      if (!rest.length) throw new FarmError('Use `$farm sell <crop> [amount|all]` or `$farm sell all`.');

      if (rest.length === 1 && String(rest[0]).toLowerCase() === 'all') {
        farm.openFarm(ctx.gid, ctx.uid);
        return startSession(ctx, 'sellconfirm');
      }

      const { query, amount } = splitAmount(rest);
      const crop = farm.resolveCrop(query);
      if (!crop) throw new FarmError(`I do not know a crop called "${query}".`);
      const result = farm.sell(ctx.gid, ctx.uid, crop.id, toAmount(amount === 'max' ? 'all' : amount, 'all'));
      return message.reply({ embeds: [sellEmbed(ctx, result)] });
    }

    case 'deliver': {
      if (!rest.length) throw new FarmError('Use `$farm deliver <contract number>`. See `$farm quests`.');
      const result = farm.deliver(ctx.gid, ctx.uid, rest[0]);
      return message.reply({ embeds: [deliverEmbed(ctx, result)] });
    }

    default:
      return message.reply({
        embeds: [errorEmbed(ctx, 'Unknown farm command. Use `$farm help` to see everything you can do.')],
      });
  }
}

module.exports = {
  name: 'farm',
  aliases: ['farming'],
  description: 'Grow crops, sell produce and build a farming empire.',
  category: 'economy',
  usage: '$farm [help]',

  async execute(client, message, args) {
    if (!message.guild) return;

    const gid = message.guild.id;
    const uid = message.author.id;
    const sub = String(args[0] || '').toLowerCase();
    const ctx = { client, message, gid, uid };

    // Rate limit (help is free).
    if (sub !== 'help') {
      const key = `${gid}:${uid}`;
      const now = Date.now();
      if (now - (lastUse.get(key) || 0) < CFG.COMMAND_COOLDOWN_MS) {
        return message.reply({ embeds: [errorEmbed(ctx, 'You are going too fast. Try again in a moment.')] }).catch(() => {});
      }
      lastUse.set(key, now);
    }

    try {
      await route(ctx, sub, args.slice(1));
    } catch (error) {
      if (error instanceof FarmError) {
        return message.reply({ embeds: [errorEmbed(ctx, error.message)] }).catch(() => {});
      }

      console.error('[Farm] Command error:', error);
      return message.reply({ embeds: [errorEmbed(ctx, 'Something went wrong with your farm. Nothing was lost; please try again.')] }).catch(() => {});
    }
  },
};
