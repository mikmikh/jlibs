// =========== CONSTANTS ==============
export const LAMBDA = "LAMBDA";
export const END = "$";

// ============ UTILS ===============
function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}
export class SSet {
  constructor(iterable = undefined, keyFn = (obj) => `${obj}`) {
    this.keyFn = keyFn;
    this.str2item = {};
    if (iterable) {
      Array.from(iterable).forEach((item) => {
        this.add(item);
      });
    }
  }
  get size() {
    return Object.keys(this.str2item).length;
  }
  has(item) {
    const key = this.keyFn(item);
    return key in this.str2item;
  }
  add(item) {
    const key = this.keyFn(item);
    if (key in this.str2item) {
      return false;
    }
    this.str2item[key] = item;
    return true;
  }
  get(item) {
    const key = this.keyFn(item);
    return this.str2item[key];
  }
  delete(item) {
    const key = this.keyFn(item);
    delete this.str2item[key];
  }
  *[Symbol.iterator]() {
    for (const item of Object.values(this.str2item)) {
      yield item;
    }
  }
  toString() {
    return Object.keys(this.str2item).sort().join("\n");
  }
}

// ============ SYNTAX ===========
export class JSyntax {
  constructor(grammarStr) {
    this.grammar = null;
    this.terminalSet = null;
    this.nonterminalSet = null;
    this.firstSet = null;
    this.followSet = null;
    this.states = null;
    this.transitions = null;
    this.actionGoto = null;
    this.conflicts = null;

    this._setUp(grammarStr);
  }
  _setUp(grammarStr) {
    this.grammar = SGrammar.fromString(grammarStr);
    this.grammar.augment();
    [this.terminalSet, this.nonterminalSet] = this.grammar.getTokenSets();
    this.firstSet = buildFirstSet(
      this.grammar,
      this.terminalSet,
      this.nonterminalSet,
    );
    this.followSet = buildFollowSet(
      this.grammar,
      this.firstSet,
      this.terminalSet,
      this.nonterminalSet,
    );
    [this.states, this.transitions] = makeStatesLA(this.grammar, this.firstSet);
    [this.actionGoto, this.conflicts] = createParsingTableLALR1(
      this.states,
      this.transitions,
      this.grammar,
    );
  }
  /**
   *
   * @param {{name: string, lex: string}[]} ltokens
   * @returns
   */
  buildAst(ltokens) {
    return buildAST(ltokens, this.grammar, this.actionGoto);
  }

  renderTables(containerEl) {
    const {
      grammar,
      firstSet,
      followSet,
      terminalSet,
      nonterminalSet,
      states,
      transitions,
      actionGoto,
      conflicts,
    } = this;

    containerEl.innerHTML = "";

    const fTableData = createFirstSetTableData(firstSet);
    const fTableEl = formatTable(fTableData);
    containerEl.appendChild(fTableEl);

    const iTableData = createItemsTableData(grammar);
    const iTableEl = formatTable(iTableData);
    containerEl.appendChild(iTableEl);

    const statesTableData = createStatesTableData(states);
    const sTableEl = formatTable(statesTableData);
    containerEl.appendChild(sTableEl);

    const tTableData = createTransitionsTableData(transitions);
    const tTableEl = formatTable(tTableData);
    containerEl.appendChild(tTableEl);

    const terminals = [...terminalSet];
    const nonterminals = [...nonterminalSet];
    const agTableInfo = createActionGotoTableData(
      states,
      terminals,
      nonterminals,
      actionGoto,
    );
    const agTableEl = formatTable(agTableInfo);
    containerEl.appendChild(agTableEl);
  }

  // https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/vis.js
  // https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/vis-network.min.css
  renderNetworkStates(containerEl) {
    const { states, transitions } = this;

    const nodesArr = states.map((s, si) => ({
      id: s.idx,
      label: `${s.idx}:\n${[...s.items].map((item) => item.repr(true)).join("\n")}`,
    }));
    const edgesArr = [];
    Object.entries(transitions).forEach(([sid, token2nextSid]) => {
      Object.entries(token2nextSid).forEach(([token, nsid]) => {
        edgesArr.push({ from: sid, to: nsid, label: token });
      });
    });

    containerEl.innerHTML = "";
    const data = {
      nodes: new vis.DataSet(nodesArr),
      edges: new vis.DataSet(edgesArr),
    };
    const options = {
      edges: {
        length: 300, // Longer edges between nodes.
      },
    };
    const network = new vis.Network(containerEl, data, options);
  }
  renderNetworkAst(
    ast,
    networkEl,
    formatFn = (node) => node.item?.repr(false) ?? node.token?.lex,
  ) {
    const nodesArr = [];
    const edgesArr = [];
    let nodeIdx = 1;
    function walkNode(node, parentIdx = -1) {
      const n = {
        id: nodeIdx++,
        label: formatFn(node),
      };
      nodesArr.push(n);
      const e = { from: parentIdx, to: n.id, width: 1, arrows: "to" };
      edgesArr.push(e);
      node.children?.forEach((c) => walkNode(c, n.id));
    }
    walkNode(ast);
    const data = {
      nodes: new vis.DataSet(nodesArr),
      edges: new vis.DataSet(edgesArr),
    };

    networkEl.innerHTML = "";
    const options = {
      layout: {
        hierarchical: {
          direction: "UD",
          sortMethod: "directed",
        },
      },
    };
    const network = new vis.Network(networkEl, data, options);
  }
}

// =============== LEXER ===========
export class LToken {
  constructor(type, value, line, column) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.column = column;
  }
  toString() {
    return `[${this.type}:${this.value}|${this.line}:${this.column}]`;
  }
}

export class JLexer {
  constructor(input) {
    this.input = input;
    this.cursor = 0;
    this.line = 1;
    this.column = 1;
  }
  *parse() {
    while (true) {
      const token = this.next();
      yield token;
      if (token.type === "EOF") {
        break;
      }
    }
  }
  next() {
    while (this._peek() !== null) {
      const char = this._peek();

      if (/\s/.test(char)) {
        this._advance();
        continue;
      }
      if (
        char === "/" &&
        this.cursor + 1 < this.input.length &&
        this.input[this.cursor + 1] === "/"
      ) {
        // skip comments
        while (this._peek() !== "\n" && this._peek() !== null) {
          this._advance();
        }
        continue;
      }
      if (/[0-9]/.test(char)) {
        return this._readNumber();
      }
      if (/[a-zA-Z_]/.test(char)) {
        return this._readIdentifier();
      }
      if (char === '"' || char === "'") {
        return this._readString();
      }
      if (
        ["+", "-", "*", "/", "=", ";", "^", "(", ")", "{", "}"].includes(char)
      ) {
        const line = this.line;
        const column = this.column;
        this._advance();
        const token = {
          type: ["(", ")", "{", "}"].includes(char) ? "BRACES" : "OPERATOR",
          value: char,
          line,
          column,
        };
        return token;
      }
      if (["<", ">"].includes(char)) {
        const line = this.line;
        const column = this.column;
        this._advance();
        let value = char;
        if (this._peek() === "=") {
          value += this._peek();
          this._advance();
        }
        const token = {
          type: "COMP",
          value,
          line,
          column,
        };
        return token;
      }
      if ([".", ","].includes(char)) {
        const line = this.line;
        const column = this.column;
        this._advance();
        const token = {
          type: "PUNCT",
          value: char,
          line,
          column,
        };
        return token;
      }

      // NOTE: unknown
      const line = this.line;
      const column = this.column;
      this._advance();

      const token = {
        type: "UNK",
        value: char,
        line,
        column,
      };
      return token;
    }

    const token = {
      type: "EOF",
      value: null,
      line: this.line,
      column: this.column,
    };
    return token;
  }

  _peek() {
    if (this.cursor >= this.input.length) {
      return null;
    }
    return this.input[this.cursor];
  }
  _advance() {
    const char = this._peek();
    if (char !== null) {
      this.cursor++;
      if (char === "\n") {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
    }

    return char;
  }
  _readNumber() {
    const line = this.line;
    const column = this.column;
    let value = "";
    while (/[0-9.]/.test(this._peek())) {
      value += this._peek();
      this._advance();
    }
    const token = {
      type: "NUMBER",
      value,
      line,
      column,
    };
    return token;
  }
  _readIdentifier() {
    const line = this.line;
    const column = this.column;
    let value = "";
    while (/[a-zA-Z0-9_]/.test(this._peek())) {
      value += this._peek();
      this._advance();
    }
    const token = {
      type: "ID",
      value,
      line,
      column,
    };
    return token;
  }
  _readString() {
    const line = this.line;
    const column = this.column;
    const quote = this._peek();
    this._advance();
    let value = "";
    while (this._peek() !== quote && this._peek() !== null) {
      value += this._peek();
      this._advance();
    }
    this._advance();
    const token = {
      type: "STRING",
      value,
      line,
      column,
    };
    return token;
  }
}

// =============== GRAMMAR ===============

export class SItem {
  constructor({
    lhs,
    rhs,
    point = 0,
    la = new Set(),
    id = null,
    annotation = null,
  } = {}) {
    this.lhs = lhs;
    this.rhs = rhs;
    this.point = point;
    this.la = la;
    this.id = id;
    this.annotation = annotation;

    if (this.rhs.length === 1 && this.rhs[0] === LAMBDA) {
      this.point = 1;
    }
  }
  static serialize() {
    return deepCopy(this);
  }
  static deserialize(obj) {
    return new SItem({
      ...obj,
      rhs: Array.from(obj.rhs),
      la: new Set(obj.la),
    });
  }
  clone() {
    return SItem.deserialize(this);
  }
  toString() {
    return this.repr(true);
  }
  repr(withLa = true) {
    const parts = [
      this.lhs,
      "->",
      ...this.rhs.slice(0, this.point),
      ".",
      ...this.rhs.slice(this.point),
    ];
    if (withLa && this.la.size > 0) {
      const laStr = [...this.la].sort().join(",");
      parts.push(`@${laStr}`);
    }

    return parts.join(" ");
  }
}
export class SGrammar {
  constructor(axiom, items) {
    this.axiom = axiom;
    this.items = items;

    this.token2items = null;
    this.token2isNonterminal = null;

    this._init();
  }
  toString() {
    const parts = [
      `Axiom: ${this.axiom}`,
      `Items:`,
      ...Object.values(this.token2items)
        .flat()
        .map((item) => item.repr(true)),
    ];
    return parts.join("\n");
  }
  augment() {
    const newAxiom = `${this.axiom}'`;
    const newItem = new SItem({ lhs: newAxiom, rhs: [this.axiom, END] });
    // newItem.id = `${newAxiom}#${0}`;

    this.token2items[newAxiom] = [newItem];
    this.axiom = newAxiom;
    this.token2isNonterminal[newAxiom] = true;

    this._setUpItemIds();

    return this;
  }
  _init() {
    const allTokens = new Set();
    const nonterminals = new Set();
    const token2items = {};
    this.items.forEach((item) => {
      allTokens.add(item.lhs);
      nonterminals.add(item.lhs);
      item.rhs.forEach((t) => {
        allTokens.add(t);
      });

      if (!(item.lhs in token2items)) {
        token2items[item.lhs] = [];
      }
      token2items[item.lhs].push(item);
    });
    const token2isNonterminal = { [END]: false };
    allTokens.forEach((t) => {
      token2isNonterminal[t] = nonterminals.has(t);
    });

    this.token2items = token2items;
    this.token2isNonterminal = token2isNonterminal;

    this._setUpItemIds();
  }
  _setUpItemIds() {
    Object.entries(this.token2items).forEach(([token, items]) => {
      items.forEach((item, i) => {
        item.id = `${token}#${i}`;
      });
    });
  }
  getTokenSets() {
    const terminalSet = new Set(
      Object.entries(this.token2isNonterminal)
        .filter(([t, isnt]) => !isnt)
        .map(([t, isnt]) => t),
    );
    const nonterminalSet = new Set(
      Object.entries(this.token2isNonterminal)
        .filter(([t, isnt]) => isnt)
        .map(([t, isnt]) => t),
    );

    return [terminalSet, nonterminalSet];
  }

  static fromString(str) {
    const lines = str
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const axiom = lines[0];
    const rulesA = lines.slice(1).map((line) => {
      const [rule, a] = line.split("@");
      return [rule.trim().replace(/\s+/g, " ").split(" "), a?.trim() ?? null];
    });
    const items = rulesA.map(
      ([rule, annotation]) =>
        new SItem({ lhs: rule[0], rhs: rule.slice(2), annotation }),
    );
    console.log(items);
    const grammar = new SGrammar(axiom, items);
    return grammar;
  }
}

// ============ GRAMMAR ANALYSIS ================

export function buildFirstSet(grammar, terminalSet, nonterminalSet) {
  /**
   * {[key: SToken]: Set<SToken>}
   */
  const firstSet = {};
  terminalSet.forEach((t) => {
    firstSet[t] = new Set([t]);
  });
  nonterminalSet.forEach((t) => {
    firstSet[t] = new Set();
  });
  let stable = false;
  while (!stable) {
    stable = true;
    Object.values(grammar.token2items)
      .flat()
      .forEach((item) => {
        const changed = buildFirstSetForItem(item, grammar, firstSet);
        if (changed) {
          stable = false;
        }
      });
  }
  return firstSet;
}

function buildFirstSetForItem(item, grammar, firstSet) {
  let i = 0;
  let lambda = false;
  let changed = false;
  for (; i < item.rhs.length; i++) {
    const token = item.rhs[i];
    lambda = false;
    const isTerminal = !grammar.token2isNonterminal[token];
    if (isTerminal) {
      if (token === LAMBDA) {
        lambda = true;
        continue;
      } else {
        if (!firstSet[item.lhs].has(token)) {
          firstSet[item.lhs].add(token);
          changed = true;
        }
        break;
      }
    }

    for (const ft of firstSet[token]) {
      if (ft === LAMBDA) {
        lambda = true;
        continue;
      }
      if (!firstSet[item.lhs].has(ft)) {
        firstSet[item.lhs].add(ft);
        changed = true;
      }
    }

    if (!lambda) {
      break;
    }
  }

  if (lambda && i === item.rhs.length) {
    if (!firstSet[item.lhs].has(LAMBDA)) {
      firstSet[item.lhs].add(LAMBDA);
      changed = true;
    }
  }
  return changed;
}
export function getFirsts(tokens, grammar, firstSet) {
  const res = new Set();
  if (tokens.length === 0) {
    res.add(LAMBDA);
    return res;
  }
  let i = 0;
  let lambda = false;
  for (; i < tokens.length; i++) {
    const token = tokens[i];
    lambda = false;
    const isTerminal = !grammar.token2isNonterminal[token];
    if (isTerminal) {
      if (token === LAMBDA) {
        lambda = true;
        continue;
      } else {
        res.add(token);
        break;
      }
    }
    for (const firstToken of firstSet[token]) {
      if (firstToken === LAMBDA) {
        lambda = true;
        continue;
      }
      res.add(firstToken);
    }
    if (!lambda) {
      break;
    }
  }
  if (lambda && i === tokens.length) {
    res.add(LAMBDA);
  }
  return res;
}

export function buildFollowSet(grammar, firstSet, terminalSet, nonterminalSet) {
  /**
   * {[key: SToken]: Set<SToken>}
   */
  const followSet = {};
  new Set([...terminalSet, ...nonterminalSet]).forEach((t) => {
    followSet[t] = new Set();
  });
  followSet[grammar.axiom].add(END);

  let stable = false;
  while (!stable) {
    stable = true;
    Object.values(grammar.token2items)
      .flat()
      .forEach((item) => {
        const changed = buildFollowSetForItem(item, firstSet, followSet);
        if (changed) {
          stable = false;
        }
      });
  }

  return followSet;
}

function buildFollowSetForItem(item, firstSet, followSet) {
  let i = item.rhs.length - 1;
  let changed = false;
  let firstRight = new Set(followSet[item.lhs]);
  for (; i >= 0; i--) {
    const token = item.rhs[i];
    for (const tr of firstRight) {
      if (!followSet[token].has(tr)) {
        followSet[token].add(tr);
        changed = true;
      }
    }
    const tokenFirstSet = firstSet[token];
    if (!tokenFirstSet.has(LAMBDA)) {
      firstRight = new Set();
    }
    for (const t of tokenFirstSet) {
      if (t !== LAMBDA) {
        firstRight.add(t);
      }
    }
  }
  return changed;
}

// ================ LALR(1) ===============

function makeClosure(itemSet, grammar) {
  let stable = false;
  while (!stable) {
    stable = true;
    const itemsToAdd = [];
    for (const item of itemSet) {
      if (item.point >= item.rhs.length) {
        // lhs->rhs.
        continue;
      }
      const ptoken = item.rhs[item.point];
      const isNonterminal = grammar.token2isNonterminal[ptoken];
      if (isNonterminal) {
        itemsToAdd.push(...grammar.token2items[ptoken]);
      }
    }
    itemsToAdd.forEach((item) => {
      if (!itemSet.has(item)) {
        itemSet.add(item);
        stable = false;
      }
    });
  }
}

function makeSetSeeds(itemSet, grammar) {
  const ptoken2itemSet = {};
  for (const item of itemSet) {
    if (item.point >= item.rhs.length) {
      continue;
    }
    const ptoken = item.rhs[item.point];
    const citem = item.clone();
    citem.point++;
    if (!(ptoken in ptoken2itemSet)) {
      ptoken2itemSet[ptoken] = new SSet([], (item) => item.repr(false));
    }
    ptoken2itemSet[ptoken].add(citem);
  }
  return ptoken2itemSet;
}

function makeClosureLA(itemSet, grammar, firstSet) {
  let stable = false;
  while (!stable) {
    stable = true;
    const itemsToAdd = [];
    for (const item of itemSet) {
      if (item.point >= item.rhs.length) {
        // lhs->rhs.
        continue;
      }
      const ptoken = item.rhs[item.point];
      const isNonterminal = grammar.token2isNonterminal[ptoken];
      if (!isNonterminal) {
        continue;
      }
      // item: [A → α • B β]
      // for each B → γ
      //    [B → • γ].la = FIRST(β)
      //    if (ε in β)
      //      [B → • γ].la += [A → α • B β].la
      const tokensAhead = item.rhs.slice(item.point + 1);
      const firsts = getFirsts(tokensAhead, grammar, firstSet);
      for (const gitem of grammar.token2items[ptoken]) {
        const newItem = gitem.clone();
        firsts.forEach((t) => {
          newItem.la.add(t);
        });
        if (newItem.la.has(LAMBDA)) {
          // first(after point) + la
          item.la.forEach((t) => {
            newItem.la.add(t);
          });
          newItem.la.delete(LAMBDA);
        }
        itemsToAdd.push(newItem);
      }
    }

    itemsToAdd.forEach((itemToAdd) => {
      if (!itemSet.has(itemToAdd)) {
        stable = false;
        itemSet.add(itemToAdd);
      } else {
        const existing = itemSet.get(itemToAdd);
        let needUpdate = false;
        itemToAdd.la.forEach((t) => {
          if (!existing.la.has(t)) {
            stable = false;
            needUpdate = true;
            existing.la.add(t);
          }
        });
      }
    });
  }
}

export function makeStatesLA(grammar, firstSet) {
  const allStates = [];
  const transitions = {};

  const startItems = new SSet(
    grammar.token2items[grammar.axiom].map((item) => {
      const newItem = item.clone();
      newItem.la = new Set([END]);
      return newItem;
    }),
    (i) => i.repr(false),
  );

  const startState = {
    idx: 0,
    items: startItems,
  };

  makeClosureLA(startState.items, grammar, firstSet);
  allStates.push(startState);

  const setQueue = [startState];
  while (setQueue.length > 0) {
    const currentState = setQueue.shift();
    const setSeeds = makeSetSeeds(currentState.items, grammar);
    for (const [p, newItems] of Object.entries(setSeeds)) {
      makeClosureLA(newItems, grammar, firstSet);
      let nextState = allStates.find((s) => `${s.items}` === `${newItems}`);
      if (!nextState) {
        nextState = { idx: allStates.length, items: newItems };
        allStates.push(nextState);
        setQueue.push(nextState);
      } else {
        let proc = false;
        for (const item of newItems) {
          const existingItem = nextState.items.get(item);
          // let ins = false;
          for (const la of item.la) {
            if (!existingItem.la.has(la)) {
              existingItem.la.add(la);
              // ins = true;
              proc = true;
            }
          }
        }
        if (proc) {
          setQueue.push(nextState);
        }
      }
      if (!(currentState.idx in transitions)) {
        transitions[currentState.idx] = {};
      }
      transitions[currentState.idx][p] = nextState.idx;
    }
  }
  return [allStates, transitions];
}

export function createParsingTableLALR1(states, transitions, grammar) {
  const actionGoto = { action: {}, goto: {} };
  const conflicts = [];
  for (const state of states) {
    const conflict = { stateIdx: state.idx, actions: new Set() };
    for (const item of state.items) {
      if (item.point === item.rhs.length) {
        const action = { type: "reduce", value: item.id };

        if (item.lhs === grammar.axiom) {
          action.type = "accept";
        }

        for (const token of item.la) {
          if (!(state.idx in actionGoto.action)) {
            actionGoto.action[state.idx] = {};
          }
          if (actionGoto.action[state.idx][token]) {
            // conflict
            conflict.actions.add(actionGoto[state.idx][token]);
            conflict.actions.add(action);
          }
          actionGoto.action[state.idx][token] = action;
        }
      }
    }

    if (transitions[state.idx]) {
      Object.entries(transitions[state.idx]).forEach(
        ([token, nextStateIdx]) => {
          const isNoneterminal = grammar.token2isNonterminal[token];
          if (isNoneterminal) {
            if (!(state.idx in actionGoto.goto)) {
              actionGoto.goto[state.idx] = {};
            }
            if (actionGoto.goto[state.idx][token]) {
              conflict.actions.add(actionGoto.goto[state.idx][token]);
              conflict.actions.add(nextStateIdx);
            }
            actionGoto.goto[state.idx][token] = nextStateIdx;
            return;
          }
          const action = { type: "shift", value: nextStateIdx };
          if (!(state.idx in actionGoto.action)) {
            actionGoto.action[state.idx] = {};
          }
          if (actionGoto.action[state.idx][token]) {
            conflict.actions.add(actionGoto.action[state.idx][token]);
            conflict.actions.add(action);
          }
          // prefer shift than reduce for longer match
          actionGoto.action[state.idx][token] = action;
        },
      );
    }

    if (conflict.actions.length > 0) {
      conflicts.push(conflict);
    }
  }

  return [actionGoto, conflicts];
}

// ================ AST ==================
export function cloneAst(node) {
  function cloneRaw(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
  function walk(node) {
    if (!node.item) {
      return cloneRaw(node);
    }
    const children = node.children.map((cnode) => walk(cnode));
    const res = cloneRaw(node);
    res.item = node.item.clone();
    res.children = children;
    return res;
  }
  const res = walk(node);
  return res;
}
export function buildAST(inputTokens, grammar, actionGoto) {
  let inputIdx = 0;
  const stackStateIds = [0];
  const stackTokens = [];
  const stackNodes = [];
  const id2item = {};
  Object.values(grammar.token2items)
    .flat()
    .forEach((item) => {
      id2item[item.id] = item;
    });
  let idx = 0;
  while (inputIdx < inputTokens.length) {
    let token = inputTokens[inputIdx];
    const currentStateId = stackStateIds.at(-1);
    const token2action = actionGoto.action[currentStateId] ?? {};
    if (!token2action[token.name]) {
      // if (token2action[LAMBDA]) {
      //   token = { name: LAMBDA, value: "" };
      // } else {
      console.log(
        `ERROR: sid:${currentStateId},token:${JSON.stringify(token)}`,
      );
      break;
      // }
    }
    const action = token2action[token.name];
    // console.log("action", action);
    if (action.type === "shift") {
      stackTokens.push(token.name);
      stackStateIds.push(action.value);
      // const node = { type: "terminal", token, inputIdx, repr: token };
      const nodeId = `${token.name}#${idx++}`;
      const node = { type: "token", token, id: nodeId };
      stackNodes.push(node);
      if (token.name !== LAMBDA) {
        inputIdx++;
      }
      continue;
    }

    const item = id2item[action.value];

    const nodeId = `${item.lhs}#${idx++}`;
    const node = {
      type: "item",
      item,
      children: [],
      id: nodeId,
    };

    for (let i = 0; i < item.rhs.length; i++) {
      if (item.rhs[i] === LAMBDA) {
        continue;
      }
      stackTokens.pop();
      stackStateIds.pop();

      node.children.push(stackNodes.at(-1));
      stackNodes.pop();
    }
    node.children.reverse();

    stackTokens.push(item.lhs);
    stackNodes.push(node);

    const lastStateId = stackStateIds.at(-1);
    const token2statId = actionGoto.goto[lastStateId];
    stackStateIds.push(token2statId[item.lhs]);

    // // ???
    if (action.type === "accept") {
      console.log("INFO:accept");
      break;
    }
  }

  return stackNodes;
}
// ====================== VISUALIZE ====================
export function createActionGotoTableData(
  states,
  terminals,
  nonterminals,
  actionGoto,
) {
  const header = [
    [
      { content: "sid", rowspan: 2 },
      { content: "action", colspan: terminals.length },
      { content: "goto", colspan: nonterminals.length },
    ],
    [
      ...terminals.map((t) => ({ content: t })),
      ...nonterminals.map((t) => ({ content: t })),
    ],
  ];
  const body = states.map((state) => {
    const sid = state.idx;
    const token2action = actionGoto.action[sid] ?? {};
    const token2goto = actionGoto.goto[sid] ?? {};
    const actions = terminals.map((t) => {
      if (!token2action[t]) {
        return { content: "" };
      }
      const action = token2action[t];
      return { content: `${action.type[0]}${action.value}` };
    });
    const gotos = nonterminals.map((t) => {
      if (!token2goto[t]) {
        return { content: "" };
      }
      const nextStateId = token2goto[t];
      return { content: `${nextStateId}` };
    });
    return [{ content: sid }, ...actions, ...gotos];
  });
  return { header, body };
}
export function createStatesTableData(states) {
  const header = [[{ content: "sid" }, { content: "items" }]];
  const body = [];
  states.forEach((state, i) => {
    const itemsArr = Array.from(state.items);
    body.push(
      [
        { content: state.idx, rowspan: state.items.size },
        { content: itemsArr[0].repr(true) },
      ],
      ...itemsArr.slice(1).map((item) => [{ content: item.repr(true) }]),
    );
  });
  return { header, body };
}
export function createTransitionsTableData(transitions) {
  const header = [[{ content: "trans" }]];
  const body = [];
  Object.entries(transitions).forEach(([sid, token2nextSid]) => {
    Object.entries(token2nextSid).forEach(([token, nsid]) => {
      body.push([{ content: `${sid}➔${token}➔${nsid}` }]);
    });
  });
  return { header, body };
}
export function createItemsTableData(grammar) {
  const header = [[{ content: "items" }]];
  const body = [];
  Object.values(grammar.token2items)
    .flat()
    .forEach((item) => {
      body.push([{ content: `${item.id}:${item.repr(false)}` }]);
    });
  return { header, body };
}
export function createFirstSetTableData(firstSet) {
  const header = [[{ content: "token" }, { content: "first" }]];
  const body = [];
  Object.entries(firstSet).forEach(([token, first]) => {
    body.push([
      { content: `${token}` },
      { content: `${Array.from(first).join(",")}` },
    ]);
  });
  return { header, body };
}

export function formatTable(tableInfo) {
  tableInfo.header.forEach((row) => {});
  const tableEl = document.createElement("table");
  const theadEl = document.createElement("thead");
  const tbodyEl = document.createElement("tbody");
  tableEl.appendChild(theadEl);
  tableEl.appendChild(tbodyEl);

  tableInfo.header.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((d) => {
      const th = document.createElement("th");
      th.innerHTML = d.content;
      th.colSpan = d.colspan ?? 1;
      th.rowSpan = d.rowspan ?? 1;
      tr.appendChild(th);
    });
    theadEl.appendChild(tr);
  });
  tableInfo.body.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((d) => {
      const th = document.createElement("td");
      th.innerHTML = d.content;
      th.colSpan = d.colspan ?? 1;
      th.rowSpan = d.rowspan ?? 1;
      tr.appendChild(th);
    });
    tbodyEl.appendChild(tr);
  });

  return tableEl;
}

export const visualize = {
  createActionGotoTableData,
  createStatesTableData,
  createTransitionsTableData,
  createItemsTableData,
  createFirstSetTableData,
  formatTable,
};

// ============== INTERP =============

export class Scope {
  constructor() {
    // deprecated
    this.frames = [{}];

    // new
    this.frameStack = [];
    this.id2frame = {};
    this.pushFrame("global");
  }
  current() {
    return this.frames.at(-1);
  }
  push() {
    this.frames.push({});
  }
  pop() {
    this.frames.pop();
  }
  set(name, value) {
    this.current()[name] = value;
  }
  get(name) {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (name in this.frames[i]) {
        return this.frames[i][name];
      }
    }
    return null;
  }

  currentFrame() {
    if (!this.frameStack.length) {
      return null;
    }
    return this.frameStack.at(-1);
  }
  pushFrame(id) {
    const frame = { nextId: this.currentFrame()?.id, data: {} };
    this.frameStack.push(frame);
    this.id2frame[id] = frame;
  }
  popFrame() {
    this.frameStack.pop();
  }
  setSymbol(name, value) {
    this.currentFrame().data[name] = value;
  }
  getSymbol(name) {
    let frame = this.currentFrame();
    while (frame) {
      if (name in frame.data) {
        return frame.data[name];
      }
      frame = this.id2frame[frame.nextId];
    }
    return undefined;
  }
}

export class ScopeV2 {
  constructor() {
    this._frameStack = [];
    this._id2frame = {};
    this._counter = 0;
    this.createFrame("global");
  }
  _currentFrame() {
    if (!this._frameStack.length) {
      return null;
    }
    return this._frameStack.at(-1);
  }
  createFrame(id, meta = {}) {
    console.log("ScopeV2::pushFrame(id, meta)", id, meta);
    const frame = { id, meta, nextId: this._currentFrame()?.id, data: {} };
    this._frameStack.push(frame);
    this._id2frame[id] = frame;
    console.log("_frameStack", this._frameStack);
  }
  pushExisting(id) {
    console.log("ScopeV2::pushExisting(id)", id);
    this._frameStack.push(this._id2frame[id]);
    console.log("_frameStack", this._frameStack);
  }
  popFrame() {
    console.log("ScopeV2::popFrame");
    this._frameStack.pop();
    console.log("_frameStack", this._frameStack);
  }
  setFrame(id) {
    console.log("ScopeV2::setFrame(id)", id);
    this._frameStack = [this._id2frame[id]];
    console.log("_frameStack", this._frameStack);
  }
  setSymbol(name, value) {
    console.log("ScopeV2::setSymbol(name, value)", name, value);
    this._currentFrame().data[name] = value;
  }
  getSymbol(name) {
    console.log("ScopeV2::getSymbol(name)", name);
    let frame = this._currentFrame();
    while (frame) {
      if (name in frame.data) {
        return frame.data[name];
      }
      frame = this._id2frame[frame.nextId];
    }
    return undefined;
  }
  nextId() {
    return this._counter++;
  }
}
export class AttributeStorage {
  constructor() {
    this._id2attrs = {};
  }
  set(id, key, value) {
    if (!(id in this._id2attrs)) {
      this._id2attrs[id] = {};
    }
    this._id2attrs[id][key] = value;
  }
  get(id, key) {
    if (!(id in this._id2attrs)) {
      return null;
    }
    return this._id2attrs[id][key];
  }
}
export class TAC {
  constructor() {
    this._commands = [];
    this._counter = 0;
  }
  add(cmd) {
    this._commands.push(cmd);
  }
  newVar() {
    return `L${this._counter++}`;
  }
  toString() {
    return this._commands.map((cmd) => cmd.join(" ")).join("\n");
  }
}

// export function interpretAst(ast, grammar, handlers) {
//   function normalizeCmds(cmds) {
//     return cmds
//       .map((cmd) => (Array.isArray(cmd) ? cmd : [cmd]))
//       .flat()
//       .filter(Boolean);
//   }
//   function walk(node) {
//     if (!node.item) {
//       return;
//     }
//     const cmds_ = node.children.map((cnode) => walk(cnode));
//     const cmds = normalizeCmds(cmds_);
//     console.log("interpret: node.item.id", node.item.id);
//     const handler = handlers[node.item.id];
//     if (!handler) {
//       return cmds;
//     }
//     return handler?.(node, cmds);
//   }
//   // NOTE: handler result is array or one cmd
//   const res = walk(ast);
//   return res;
// }

export function walkAst(ast, handlers, ctx) {
  function walk(node) {
    if (!node.item) {
      return;
    }

    const itemId = node.item.id;
    const handler = handlers[node.item.id];
    handler?.(node, "down", ctx);
    node.children.forEach((cnode) => walk(cnode));
    return handler?.(node, "up", ctx);
  }
  walk(ast);
}
export function walkAstRet(ast, handlers, ctx) {
  function walk(node) {
    if (!node.item) {
      return;
    }
    const childRets = node.children.forEach((cnode) => walk(cnode)).flat();
    const handler = handlers[node.item.id];
    return handler?.(node, childRets, ctx) ?? [];
  }
  walk(ast);
}

class JNodeCtx {
  constructor(node, attributes) {
    this.node = node;
    this.attributes = attributes;

    this.key2node = {};
    if (this.node.item) {
      const item = this.node.item;
      const counters = { [item.lhs]: 1 };
      this.key2node[item.lhs] = this.node;
      this.key2node[`${item.lhs}#${0}`] = this.node;
      item.rhs.forEach((t, i) => {
        if (!(t in counters)) {
          counters[t] = 0;
        }

        if (counters[t] === 0) {
          this.key2node[t] = this.node.children[i];
        }
        this.key2node[`${t}#${counters[t]}`] = this.node.children[i];
        counters[t]++;
      });
    }
  }

  at(key) {
    const cnode = this.key2node[key];
    return new Proxy(this, {
      get(target, prop) {
        if (["token", "item"].includes(prop)) {
          return cnode[prop];
        }
        if (prop === "lex") {
          return cnode.token.lex;
        }
        return target.attributes.get(cnode.id, prop);
      },
      set(target, prop, value) {
        target.attributes.set(cnode.id, prop, value);
        return true;
      },
    });
  }
}
export class JCtx {
  constructor(attributes) {
    this.attributes = attributes;
  }
  getNodeCtx(node) {
    return new JNodeCtx(node, this.attributes);
  }
}
