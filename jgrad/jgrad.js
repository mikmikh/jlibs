// dL/dinput = dL/dc * dc/dinput
// dL/dc - grad of loss for func output
const op2backwardFn = {
  add: {
    forward: (node) => {
      // c=a+b
      const [a, b] = node._prev;
      node.data = a.data + b.data;
    },
    backward: (ograd, node) => {
      // dL/da=dL/dc*1, dL/db=dL/dc*1
      const [a, b] = node._prev;
      a._grad += ograd;
      b._grad += ograd;
    },
  },
  sub: {
    forward: (node) => {
      // c=a-b
      const [a, b] = node._prev;
      node.data = a.data - b.data;
    },
    backward: (ograd, node) => {
      // dL/da=dL/dc*1, dL/db=dL/dc*(-1)
      const [a, b] = node._prev;
      a._grad += ograd;
      b._grad += ograd * -1;
    },
  },
  neg: {
    forward: (node) => {
      // c=-a
      const [a] = node._prev;
      node.data = -a.data;
    },
    backward: (ograd, node) => {
      // dL/da=dL/dc*(-1)
      const [a] = node._prev;
      a._grad += ograd * -1;
    },
  },
  mul: {
    forward: (node) => {
      // c=a*b
      const [a, b] = node._prev;
      node.data = a.data * b.data;
    },
    backward: (ograd, node) => {
      // dL/da=dL/dc*b, dL/db=dL/dc*a
      const [a, b] = node._prev;
      a._grad += ograd * b.data;
      b._grad += ograd * a.data;
    },
  },
  div: {
    forward: (node) => {
      // c=a/b
      const [a, b] = node._prev;
      node.data = a.data / b.data;
    },
    backward: (ograd, node) => {
      // dL/da=dL/dc*(1/b), dL/db=dL/dc*(-a/b^2)
      const [a, b] = node._prev;
      a._grad += ograd * (1 / b.data);
      b._grad += ograd * (-a.data / (b.data * b.data));
    },
  },
  abs: {
    forward: (node) => {
      // c=|a|
      const [a] = node._prev;
      node.data = Math.abs(a.data);
    },
    backward: (ograd, node) => {
      // dL/da=sign(a)
      const [a] = node._prev;
      a._grad += ograd * Math.sign(a.data);
    },
  },
  pow: {
    forward: (node) => {
      // c=a^n
      const [a] = node._prev;
      const { n } = node._params;
      node.data = Math.pow(a.data, n);
    },
    backward: (ograd, node) => {
      // dL/da = dL/dc*n*a^(n-1)
      const [a] = node._prev;
      const { n } = node._params;
      a._grad += ograd * n * Math.pow(a.data, n - 1);
    },
  },
  exp: {
    forward: (node) => {
      // c=e^a
      const [a] = node._prev;
      node.data = Math.exp(a.data);
    },
    backward: (ograd, node) => {
      // dL/da=dL/dc*e^a=dL/dc*c
      const [a] = node._prev;
      a._grad += ograd * node.data;
    },
  },
  ln: {
    forward: (node) => {
      // c=ln(a) a>0
      const [a] = node._prev;
      node.data = Math.log(a.data);
    },
    backward: (ograd, node) => {
      // dL/da=dL/dc*(1/a)
      const [a] = node._prev;
      a._grad += (ograd * 1) / a.data;
    },
  },
  tanh: {
    forward: (node) => {
      // c=tanh(a)
      const [a] = node._prev;
      node.data = Math.tanh(a.data);
    },
    backward: (ograd, node) => {
      // dL/da=dL/dc*(1-tanh(a)^2)=dL/dc*(1-c^2)
      const [a] = node._prev;
      a._grad += ograd * (1 - node.data * node.data);
    },
  },
  sig: {
    forward: (node) => {
      // c=sig(a)=1/(1+e^(-a))
      const [a] = node._prev;
      node.data = 1 / (a + Math.exp(-a.data));
    },
    backward: (ograd, node) => {
      // dL/da=dL/dc*sig(a)*(1-sig(a))=dL/dc*c*(1-c)
      const [a] = node._prev;
      a._grad += ograd * node.data * (1 - node.data);
    },
  },
  relu: {
    forward: (node) => {
      // c=max(0,a)
      const [a] = node._prev;
      node.data = Math.max(0, a.data);
    },
    backward: (ograd, node) => {
      // dL/da=dL/dc*1 (a>0), dL/da=dL/dc*0 (a<=0)
      const [a] = node._prev;
      a._grad += ograd * (a.data > 0 ? 1 : 0);
    },
  },
  lrelu: {
    forward: (node) => {
      // c=max(alpha*a,a) (alpha=0.01)
      const [a] = node._prev;
      const { alpha } = node._params;
      node.data = Math.max(alpha * a.data, a.data);
    },
    backward: (ograd, node) => {
      // dL/da=dL/dc*1 (a>0), dL/da=dL/dc*alpha (a<=0)
      const [a] = node._prev;
      const { alpha } = node._params;
      a._grad += ograd * (a.data > 0 ? 1 : alpha);
    },
  },
  mse: {
    forward: (node) => {
      // L=1/N*sum((yi-ti)^2)
      const allPrev = node._prev;
      const { n } = node._params;
      const preds = allPrev.slice(0, n);
      const targets = allPrev.slice(n);
      const diffSquare = preds.map(
        (_, i) => (preds[i].data - targets[i].data) ** 2,
      );
      const ss = diffSquare.reduce((s, x) => s + x, 0);
      node.data = (1 / n) * ss;
    },
    backward: (ograd, node) => {
      // dL/dyi = 2/N*(yi-ti)
      const allPrev = node._prev;
      const { n } = node._params;
      const preds = allPrev.slice(0, n);
      const targets = allPrev.slice(n);
      preds.forEach((_, i) => {
        preds[i]._grad += (2 / n) * (preds[i].data - targets[i].data);
      });
    },
  },
  mae: {
    forward: (node) => {
      // L=1/N*|yi-ti|
      const allPrev = node._prev;
      const { n } = node._params;
      const preds = allPrev.slice(0, n);
      const targets = allPrev.slice(n);
      const diffSquare = preds.map((_, i) =>
        Math.abs(preds[i].data - targets[i].data),
      );
      const ss = diffSquare.reduce((s, x) => s + x, 0);
      node.data = (1 / n) * ss;
    },
    backward: (ograd, node) => {
      // dL/dyi = 1/N*sign(yi-ti)
      const allPrev = node._prev;
      const { n } = node._params;
      const preds = allPrev.slice(0, n);
      const targets = allPrev.slice(n);
      preds.forEach((_, i) => {
        preds[i]._grad += (1 / n) * Math.sign(preds[i].data - targets[i].data);
      });
    },
  },
  bce: {
    forward: (node) => {
      // L = -1/N*sum[ti*ln(yi) + (1-t)*ln(1-yi)]
      const allPrev = node._prev;
      const { n } = node._params;
      const preds = allPrev.slice(0, n);
      const targets = allPrev.slice(n);
      const sumItems = preds.map(
        (_, i) =>
          targets[i] * Math.log(preds[i]) +
          (1 - targets[i]) * Math.log(1 - preds[i]),
      );
      const ss = sumItems.reduce((s, x) => s + x, 0);
      node.data = -(1 / n) * ss;
    },
    backward: (ograd, node) => {
      // dL/dyi = 1/N*[(1-ti)/(1-yi) - ti/yi]
      const allPrev = node._prev;
      const { n } = node._params;
      const preds = allPrev.slice(0, n);
      const targets = allPrev.slice(n);
      preds.forEach((_, i) => {
        preds[i]._grad +=
          (1 / n) * ((1 - targets[i]) / (1 - preds[i]) - targets[i] / preds[i]);
      });
    },
  },
  cce: {
    forward: (node) => {
      // K classes, one hot encoded
      // y_0,0 y_0,1 ... y_n-1,k-1, t_0,0 ... t_n-1,k-1
      // L = -1/N*sum_i sum_k t_i,k * ln(y_i,k)
      const allPrev = node._prev;
      const { n, k } = node._params;
      const preds = allPrev.slice(0, n * k);
      const targets = allPrev.slice(n * k);
      const sumItems = preds.map((_, i) => targets[i] * Math.log(preds[i]));
      const ss = sumItems.reduce((s, x) => s + x, 0);
      node.data = -(1 / n) * ss;
    },
    backward: (ograd, node) => {
      // dL/dy_i,k = -1/N*[t_i,k/y_i,k]
      const allPrev = node._prev;
      const { n, k } = node._params;
      const preds = allPrev.slice(0, n * k);
      const targets = allPrev.slice(n * k);
      preds.forEach((_, i) => {
        preds[i]._grad += -(1 / n) * (targets[i] / preds[i]);
      });
    },
  },
  max: {
    forward: (node) => {
      // c=max(a,b)
      const [a, b] = node._prev;
      node.data = Math.max(a.data, b.data);
    },
    backward: (ograd, node) => {
      // dL/da=dL/dc*(a>=b), dL/db=dL/dc*(a<b)
      const [a, b] = node._prev;
      a._grad += ograd * (a.data >= b.data ? 1 : 0);
      b._grad += ograd * (a.data < b.data ? 1 : 0);
    },
  },
  min: {
    forward: (node) => {
      // c=min(a,b)
      const [a, b] = node._prev;
      node.data = Math.min(a.data, b.data);
    },
    backward: (ograd, node) => {
      // dL/da=dL/dc*(a<=b), dL/db=dL/dc*(a>b)
      const [a, b] = node._prev;
      a._grad += ograd * (a.data <= b.data ? 1 : 0);
      b._grad += ograd * (a.data > b.data ? 1 : 0);
    },
  },
};
function JSoftmax(logits) {
  // pi=e^zi/sum(e^zj)
  // dpi/dzj=pi*([i==j] - pi)
  // logits -> probs

  const exps = logits.map((l) => l.exp());
  const s = exps.reduce((s, x) => s.add(x), JNode.fromValue(0));
  const probs = exps.map((e) => e.div(s));
  return probs;
}
function JLogSoftmax(logits) {
  // logits -> log(probs)
  // ln(pi) = zi-ln(sum e^zj)
  // dln(pi)/dzj = [i==j]-pj
  const exps = logits.map((l) => l.exp());
  const s = exps.reduce((s, x) => s.add(x), JNode.fromValue(0));
  const lnS = s.ln();
  const lnProbs = logits.map((l) => l.sub(lnS));
  return lnProbs;
}

function _ensureNode(valueOrNode) {
  if (valueOrNode instanceof JNode) {
    return valueOrNode;
  }
  return JNode.fromValue(valueOrNode);
}
export class JNode {
  constructor(prev = null, op = null, params = null) {
    this._prev = prev;
    this._op = op;
    this._params = params;
    this.data = 0;
    this._grad = 0;
  }
  static fromValue(value) {
    const node = new JNode();
    node.data = value;
    return node;
  }

  forward() {
    op2backwardFn[this._op]?.forward(this);
  }
  backward(ograd) {
    op2backwardFn[this._op]?.backward(ograd, this);
  }
  add(other) {
    other = _ensureNode(other);
    return new JNode([this, other], "add");
  }
  sub(other) {
    other = _ensureNode(other);
    return new JNode([this, other], "sub");
  }
  neg() {
    return new JNode([this], "neg");
  }
  mul(other) {
    other = _ensureNode(other);
    return new JNode([this, other], "mul");
  }
  div(other) {
    other = _ensureNode(other);
    return new JNode([this, other], "div");
  }
  abs() {
    return new JNode([this], "abs");
  }
  pow(n) {
    return new JNode([this], "pow", { n });
  }
  exp() {
    return new JNode([this], "exp");
  }
  ln() {
    return new JNode([this], "ln");
  }
  tanh() {
    return new JNode([this], "tanh");
  }
  sig() {
    return new JNode([this], "sig");
  }
  relu() {
    return new JNode([this], "relu");
  }
  lrelu(alpha = 0.01) {
    return new JNode([this], "relu", { alpha });
  }
  static loss(predictions, targets, ltype = "mse") {
    // mse,mae,bce,cce
    return new JNode([...predictions, ...targets], ltype, {
      n: predictions.length,
    });
  }
}

export function createTopoOrder(root) {
  const order = [];
  const visited = new Set();
  function dfs(node) {
    if (visited.has(node)) {
      return;
    }
    visited.add(node);
    node._prev?.forEach((cnode) => {
      if (!visited.has(cnode)) {
        dfs(cnode);
      }
    });
    order.push(node);
  }
  dfs(root);
  return order;
}

// L=1/N*sum((yi-ti)^2)
// dL/dyi = 2/N*(yi-ti)
export function JLossMse(actual, target) {
  let res = JNode.fromValue(0);
  target.forEach((e, i) => {
    res = res.add(actual[i].sub(target[i])).pow(2);
  });
  res = res.div(target.length);
  return res;
}
// L=1/N*sum(|yi-ti|)
// dL/dyi = 1/N*sign(yi-ti)
export function JLossMae(actual, target) {
  let res = JNode.fromValue(0);
  target.forEach((e, i) => {
    res = res.add(actual[i].sub(target[i])).abs();
  });
  res = res.div(target.length);
  return res;
}
// L=-1/N*sum((ti*ln(yi) + (1-ti)*ln(1-yi)))
// dL/dyi = 1/N*((1-ti)/(1-yi) - ti/yi)
export function JLossCrossEntropy(actual, target) {
  let res = JNode.fromValue(0);
  target.forEach((e, i) => {
    const s0 = target[i].mul(actual[i].ln());
    const s1 = target[i].neg().add(1).mul(actual[i].neg().add(1).ln());
    res = res.add(s0.add(s1));
  });
  res = res.div(-target.length);
  return res;
}

export function JLossLogSoftmaxCrossEntropy(actual, target) {
  const exps = actual.map((n) => n.exp());
  const s = exps.reduce((s, x) => s.add(x));
  const ls = s.log();
  const zy = actual.filter((_, i) => target[i])[0];
  const res = zy.neg().add(s);
  return res;
}

export class JNeuron {
  constructor(n, activation = "relu", bias = true, rng = Math) {
    this.n = n;
    this.activation = activation;
    this._weights = [...new Array(n)].map(() =>
      JNode.fromValue(rng.random() * 2 - 1),
    );
    this._bias = bias ? JNode.fromValue(0) : null;
  }
  get parameters() {
    const res = [...this._weights];
    if (this._bias) {
      res.push(this._bias);
    }
    return res;
  }
  build(inputNodes) {
    const nws = inputNodes.map((n, i) => n.mul(this._weights[i]));
    if (this._bias) {
      nws.push(this._bias);
    }
    let res = nws.reduce((s, x) => s.add(x));
    if (this.activation) {
      res = new JNode([res], this.activation);
    }
    return res;
  }
}

export class JLinear {
  constructor(n_in, n_out, activation = "relu", bias = true, rng = Math) {
    this.n_in = n_in;
    this.n_out = n_out;
    this.neurons = [...new Array(n_out)].map(
      (_, i) => new JNeuron(n_in, activation, bias, rng),
    );
  }
  build(inputNodes) {
    const outNodes = this.neurons.map((n) => n.build(inputNodes));
    return outNodes;
  }
  get parameters() {
    return this.neurons.map((n) => n.parameters).flat();
  }
}

// Multilayer Perceptron
export class JMLP {
  constructor(n_in, rng = Math) {
    this.n_in = n_in;
    this.rng = rng;
    this.layers = [];

    this._layerConfigs = [];
  }
  add(n, activation = "relu", bias = true) {
    this._layerConfigs.push({
      n,
      activation,
      bias,
    });
    return this;
  }
  build(inputNodes) {
    let outputs = inputNodes;
    for (let i = 0; i < this._layerConfigs.length; i++) {
      const { n, activation, bias } = this._layerConfigs[i];
      let layer = null;
      if (i === 0) {
        layer = new JLinear(this.n_in, n, activation, bias, this.rng);
      } else {
        const prevLayer = this.layers.at(-1);
        layer = new JLinear(prevLayer.n_in, n, activation, bias, this.rng);
      }
      this.layers.push(layer);
      outputs = layer.build(outputs);
    }

    return outputs;
  }
  get parameters() {
    return this.layers.map((l) => l.parameters).flat();
  }
}

export class JSGDOptimizer {
  constructor(params, lr) {
    this.params = params;
    this.lr = lr;
  }
  step() {
    this.params.forEach((node) => {
      node.data += -this.lr * node._grad;
    });
  }
}
