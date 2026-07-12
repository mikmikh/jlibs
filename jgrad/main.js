import * as jml from "./jgrad.js";

function network2vis(root, params) {
  const paramSet = new Set(params);
  const nodesArr = [];
  const edgesArr = [];
  let nodeIdx = 1;
  function walkNode(node, parentIdx = -1) {
    let labelParts = [];
    if (node._op) {
      labelParts.push(node._op);
    } else if (paramSet.has(node)) {
      labelParts.push("weight");
    } else {
      labelParts.push("value");
    }
    labelParts.push(`grad: ${node._grad}`);
    labelParts.push(`data: ${node.data}`);
    const label = labelParts.join("\n");
    const n = {
      id: nodeIdx++,
      label: label,
    };
    nodesArr.push(n);
    const e = { from: parentIdx, to: n.id, width: 1, arrows: "to" };
    edgesArr.push(e);
    node._prev?.forEach((c) => walkNode(c, n.id));
  }
  walkNode(root);
  const data = {
    nodes: new vis.DataSet(nodesArr),
    edges: new vis.DataSet(edgesArr),
  };
  return data;
}

function plotNetwork(root, params) {
  const networkEl = document.querySelector(".node-network");
  const data = network2vis(root, params);
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

function main() {
  console.log("main");

//   const linear = new jml.JLinear(2, 1, null);
  const linear = new jml.JMLP(2).add(2, 'relu').add(1, null);
  const inputs = [...new Array(2)].map(() => jml.JNode.fromValue(0));
  const outputs = linear.build(inputs);
  const targets = [...new Array(1)].map(() => jml.JNode.fromValue(0));
  const loss = jml.JLossMse(outputs, targets);
  console.log("loss", loss);

  const topo = jml.createTopoOrder(loss);
  const forwardOrder = topo;
  console.log("forwardOrder", forwardOrder);
  const backwardOrder = [...topo].reverse();
  console.log("backwardOrder", backwardOrder);

  const params = linear.parameters;
  console.log("params", params);

  const optim = new jml.JSGDOptimizer(params, 0.01);

  plotNetwork(loss, params);

  for (let ei = 0; ei < 1; ei++) {
    for (let bi = 0; bi < 8; bi++) {
      console.log("==================== iter", bi);
      const inputVals = [...new Array(2)].map(() => Math.random() * 2 - 1);
      const targetVals = [inputVals.reduce((s, x) => s + x)];
      inputs.forEach((n, i) => {
        inputs[i].data = inputVals[i];
      });
      console.log(`iter:`, inputVals, targetVals);
      targets.forEach((n, i) => {
        targets[i].data = targetVals[i];
      });
      // zero grad
      forwardOrder.forEach((node) => {
        node._grad = 0;
      });
      // forward
      forwardOrder.forEach((node) => {
        node.forward();
      });
      console.log(
        "actual: ",
        outputs.map((n) => n.data),
      );
      console.log("loss: ", loss.data);
      // backward
      backwardOrder.forEach((node, i) => {
        if (i === 0) {
          node._grad = 1;
        }
        node.backward(node._grad);
      });
      // update weights
      optim.step();
    }
  }

  plotNetwork(loss, params);
}

main();
