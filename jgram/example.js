import {
  JSyntax,
  JLexer,
  visualize,
  LAMBDA,
  cloneAst,
  Scope,
  walkAst,
  ScopeV2,
  AttributeStorage,
  TAC,
  JCtx,
} from "./jgram.js";

const grammarStr = `S
  S -> form S
  S -> LAMBDA
  form -> ( form_exp )
  form_exp -> :defun :id ( params ) S
  form_exp -> :defvar :id arg
  form_exp -> :id args
  params -> :id params
  params -> LAMBDA
  args -> arg args
  args -> LAMBDA
  arg -> form
  arg -> :id
  arg -> :num
  arg -> :str
`;

const iterpHandlers = {
  "S#0": (node, dir, { scope, tac, jctx }) => {
    // S -> form S
    const jjnode = jctx.getNodeCtx(node);
    if (dir === "up") {
      jjnode.at("S#0")["exec"] = () => {
        const formRes = jjnode.at("form")["exec"]?.();
        const S1Res = jjnode.at("S#1")["exec"]?.();
        return S1Res ?? formRes;
      };
    }
  },
  "form#0": (node, dir, { scope, tac, jctx }) => {
    // form -> ( form_exp )
    const jjnode = jctx.getNodeCtx(node);
    if (dir === "up") {
      jjnode.at("form")["exec"] = jjnode.at("form_exp")["exec"];
    }
  },
  "form_exp#0": (node, dir, { scope, tac, jctx }) => {
    // form_exp -> :defun :id ( params ) S
    const jjnode = jctx.getNodeCtx(node);
    const funcName = jjnode.at(":id").lex;

    if (dir === "down") {
      const frameId = `${funcName}#${scope.nextId()}`;
      const funcInfo = { type: "function", params: [], frameId, exec: null };
      scope.setSymbol(funcName, funcInfo);
      scope.createFrame(frameId, { funcName });
      jjnode.at("form_exp")["frameId"] = frameId;
    } else {
      scope.popFrame();
      // TODO: get params, create func
      const funcInfo = scope.getSymbol(funcName);
      funcInfo.params = jjnode.at("params").params;
      funcInfo.exec = (args) => {
        scope.pushExisting(funcInfo.frameId);
        funcInfo.params.forEach((param, i) => {
          const value = args[i];
          scope.setSymbol(param, { type: "parameter", value });
        });
        const res = jjnode.at("S")["exec"]();
        scope.popFrame();
        return res;
      };
    }
  },
  "form_exp#1": (node, dir, { scope, tac, jctx }) => {
    // form_exp -> :defvar :id arg
    const jjnode = jctx.getNodeCtx(node);
    const varName = jjnode.at(":id").lex;
    if (dir === "down") {
      scope.setSymbol(varName, { type: "variable", value: null });
    } else {
      jjnode.at("form_exp")["exec"] = () => {
        const argRes = jjnode.at("arg")["exec"]();
        scope.getSymbol(varName).value = argRes;
        return argRes;
      };
    }
  },
  "form_exp#2": (node, dir, { scope, tac, jctx }) => {
    // form_exp -> :id args
    const jjnode = jctx.getNodeCtx(node);
    if (dir === "up") {
      const funcName = jjnode.at(":id").lex;
      jjnode.at("form_exp")["exec"] = () => {
        const argsRes = jjnode.at("args")["execs"].map((exec) => exec());
        const funcSymb = scope.getSymbol(funcName);
        return funcSymb.exec(argsRes);
      };
    }
  },
  "params#0": (node, dir, { scope, tac, jctx }) => {
    // params -> :id params
    const jjnode = jctx.getNodeCtx(node);
    if (dir === "up") {
      const paramName = jjnode.at(":id").lex;
      const paramsNames = jjnode.at("params#1")["params"] ?? [];
      jjnode.at("params")["params"] = [paramName, ...paramsNames];
    }
  },
  "args#0": (node, dir, { scope, tac, jctx }) => {
    // args -> arg args
    const jjnode = jctx.getNodeCtx(node);
    if (dir === "up") {
      const argExec = jjnode.at("arg")["exec"];
      const argsExecs = jjnode.at("args#1")["execs"] ?? [];
      jjnode.at("args#0")["execs"] = [argExec, ...argsExecs];
    }
  },
  "arg#0": (node, dir, { scope, tac, jctx }) => {
    // arg -> form
    const jjnode = jctx.getNodeCtx(node);
    if (dir === "up") {
      jjnode.at("arg")["exec"] = jjnode.at("form")["exec"];
    }
  },
  "arg#1": (node, dir, { scope, tac, jctx }) => {
    // arg -> :id
    const jjnode = jctx.getNodeCtx(node);
    if (dir === "up") {
      const varName = jjnode.at(":id").lex;
      jjnode.at("arg")["exec"] = () => {
        return scope.getSymbol(varName).value;
      };
    }
  },
  "arg#2": (node, dir, { scope, tac, jctx }) => {
    // arg -> :num
    const jjnode = jctx.getNodeCtx(node);
    if (dir === "up") {
      const value = +jjnode.at(":num").lex;
      jjnode.at("arg")["exec"] = () => value;
    }
  },
  "arg#3": (node, dir, { scope, tac, jctx }) => {
    // arg -> :str
    const jjnode = jctx.getNodeCtx(node);
    if (dir === "up") {
      const value = jjnode.at(":str").lex;
      jjnode.at("arg")["exec"] = () => value;
    }
  },
};

const inputRawStr = `(defun calc (a b)
  (defvar x (+ a b))
  (* x 2)) (calc 1 2)`;

function ltoken2stoken(ltoken, terminalSet) {
  const keywords = {
    defun: ":defun",
    defvar: ":defvar",
    "+": ":id",
    "*": ":id",
  };
  if (keywords[ltoken.value]) {
    return { name: keywords[ltoken.value], lex: ltoken.value };
  }
  if (["ID"].includes(ltoken.type)) {
    return { name: ":id", lex: ltoken.value };
  }
  if (["NUMBER"].includes(ltoken.type)) {
    return { name: ":num", lex: ltoken.value };
  }
  if (["STRING"].includes(ltoken.type)) {
    return { name: ":str", lex: ltoken.value };
  }
  if (ltoken.type === "EOF") {
    return { name: "$", lex: "" };
  }

  return { name: ltoken.value, lex: ltoken.value };
}

const syntax = new JSyntax(grammarStr);

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
} = syntax;

const lexer = new JLexer(inputRawStr);
const ltokensRaw = [...lexer.parse()];
const ltokens = ltokensRaw.map((lt) =>
  ltoken2stoken(lt, syntax.terminalSet),
);

const nodes = syntax.buildAst(ltokens);
const ast = nodes[0];

const scope = new ScopeV2();
scope.setSymbol("+", {
  type: "function",
  params: [],
  frameId: "global",
  exec: ([a, b]) => a + b,
});
scope.setSymbol("*", {
  type: "function",
  params: [],
  frameId: "global",
  exec: ([a, b]) => a * b,
});
const attributes = new AttributeStorage();
const tac = new TAC();
const jctx = new JCtx(attributes);
const ctx = {
  scope,
  attributes,
  tac,
  jctx,
};
walkAst(ast, iterpHandlers, ctx);

const jjnode = jctx.getNodeCtx(ast);
scope.setFrame("global");
const res = jjnode.at("S").exec();
console.log('res',res);
