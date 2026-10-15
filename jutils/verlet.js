import * as jutils from "./utils.js";

const maxVelMag = 1;

export class VerletObject {
  constructor(pos, radius = 25) {
    this.currPos = null;
    this.prevPos = null;
    this.radius = radius;
    this.acc = [0, 0];
    this.fpos = null;
    this.setPos(pos);
  }

  get vel() {
    return jutils.subV(this.currPos, this.prevPos);
  }
  get pos() {
    return this.currPos;
  }
  setPos(pos) {
    this.currPos = [...pos];
    this.prevPos = [...pos];
  }
  updatePosition(dt) {
    let vel = this.vel;
    const mag = jutils.lenV(vel);
    if (mag > maxVelMag) {
      vel = jutils.mulS(jutils.normalizeV(vel), maxVelMag);
    }
    this.prevPos = this.currPos;
    this.currPos = jutils.addV(
      jutils.addV(this.currPos, vel),
      jutils.mulS(this.acc, dt * dt),
    );
    this.acc = [0, 0];
    if (this.fpos) {
      this.setPos(this.fpos);
    }
  }
  accelerate(acc) {
    this.acc = jutils.addV(this.acc, acc);
  }
}

export class Link {
  constructor(lhs, rhs, len) {
    this.lhs = lhs;
    this.rhs = rhs;
    this.len = len;
  }
  apply() {
    const axis = jutils.subV(this.lhs.currPos, this.rhs.currPos);
    const dist = jutils.lenV(axis);
    const normal = jutils.normalizeV(axis);
    const delta = this.len - dist;
    this.lhs.currPos = jutils.addV(
      this.lhs.currPos,
      jutils.mulS(normal, 0.5 * delta),
    );
    this.rhs.currPos = jutils.addV(
      this.rhs.currPos,
      jutils.mulS(normal, -0.5 * delta),
    );
  }
}

export class Solver {
  constructor(config) {
    this.config = config;
    this.gravity = [...config.gravity];
    this.objects = [];
    this.links = [];
    this.size = [600, 600];
  }
  resize(size) {
    this.size = [...size];
  }

  update(dt) {
    this.applyGravity();
    this.applyConstraintBox();
    this.applyLinks();
    this.solveCollisions();
    this.updatePosition(dt);
  }

  updatePosition(dt) {
    this.objects.forEach((obj) => {
      obj.updatePosition(dt);
    });
  }

  applyGravity() {
    this.objects.forEach((obj) => {
      obj.accelerate(this.gravity);
    });
  }

  applyConstraintCircle() {
    const position = [0, 0];
    const radius = 300;
    this.objects.forEach((obj) => {
      const toObj = jutils.subV(obj.currPos, position);
      const dist = jutils.lenV(toObj);
      if (dist > radius - obj.radius) {
        const n = jutils.normalizeV(toObj);
        obj.currPos = jutils.addV(
          position,
          jutils.mulS(n, radius - obj.radius),
        );
      }
    });
  }
  applyConstraintBox() {
    const position = [0, 0];
    const start = jutils.addV(position, jutils.mulS(this.size, -0.5));
    const end = jutils.addV(position, jutils.mulS(this.size, 0.5));
    this.objects.forEach((obj) => {
      obj.pos = obj.pos.map((v, i) =>
        Math.max(
          start[i] + obj.radius,
          Math.min(end[i] - obj.radius, obj.pos[i]),
        ),
      );
    });
  }
  // _applyConstraintBoxOne(obj) {
  //   const position = [0, 0];
  //   const start = jutils.addV(position, jutils.mulS(this.size, -0.5));
  //   const end = jutils.addV(position, jutils.mulS(this.size, 0.5));
  //   const newPos = start.map((v, i) =>
  //     Math.max(
  //       start[i] + obj.radius,
  //       Math.min(end[i] - obj.radius, obj.pos[i]),
  //     ),
  //   );
  //   obj.setPos(newPos);
  // }

  solveCollisions() {
    const n = this.objects.length;
    for (let i = 0; i < n; i++) {
      const lhs = this.objects[i];
      for (let j = i + 1; j < n; j++) {
        const rhs = this.objects[j];
        const axis = jutils.subV(lhs.currPos, rhs.currPos); // lhs.currPos.sub(rhs.currPos);
        const dist = jutils.lenV(axis); //axis.len();
        const minDist = lhs.radius + rhs.radius;
        if (dist < minDist) {
          const normal = jutils.normalizeV(axis); // axis.normalize();
          const delta = minDist - dist;
          lhs.currPos = jutils.addV(
            lhs.currPos,
            jutils.mulS(normal, 0.5 * delta),
          );
          // lhs.currPos.add(normal.mul(0.5 * delta), true);
          // lhs.setPos(lhs.currPos.add(normal.mul(0.5 * delta)))
          rhs.currPos = jutils.addV(
            rhs.currPos,
            jutils.mulS(normal, -0.5 * delta),
          );
          // rhs.currPos.add(normal.mul(-0.5 * delta), true);
          // rhs.setPos(rhs.currPos.add(normal.mul(-0.5 * delta)))
        }
      }
    }
  }

  applyLinks() {
    this.links.forEach((link) => {
      link.apply();
    });
  }
}

export class JShape {
  constructor(objects, links) {
    this.objects = objects;
    this.links = links;
  }
  addToSolver(solver) {
    this.objects.forEach((obj) => {
      solver.objects.push(obj);
    });
    this.links.forEach((link) => {
      solver.links.push(link);
    });
  }
  removeFromSolver(solver) {
    solver.objects = solver.objects.filter(
      (obj) => this.objects.indexOf(obj) === -1,
    );
    solver.links = solver.links.filter(
      (link) => this.links.indexOf(link) === -1,
    );
  }
  getPosition() {
    throw Error("not implemented");
  }
  getAngle() {
    throw Error("not implemented");
  }
}

export class JBox extends JShape {
  constructor(pos, size) {
    super([], []);
    this.size = size;
    this.angle = 0;
    const radius = 10;
    // const off = size.mul(0.5).sub(new Vector2(radius, radius));
    const off = jutils.subV(jutils.mulS(size, 0.5), [radius, radius]);
    const positions = [
      [pos[0] - off[0], pos[1] - off[1]],
      [pos[0] + off[0], pos[1] - off[1]],
      [pos[0] - off[0], pos[1] + off[1]],
      [pos[0] + off[0], pos[1] + off[1]],
    ];
    this.objects = positions.map((pos) => new VerletObject(pos, radius));

    this.links = [];
    const n = this.objects.length;
    for (let i = 0; i < n; i++) {
      const lhs = this.objects[i];
      for (let j = i + 1; j < n; j++) {
        const rhs = this.objects[j];
        const len = jutils.lenV(jutils.subV(lhs.pos, rhs.pos)); // lhs.pos.sub(rhs.pos).len();
        this.links.push(new Link(lhs, rhs, len));
      }
    }
  }
  getPosition() {
    // return this.objects[0].pos.add(this.objects[3].pos).mul(0.5);
    return jutils.mulS(
      jutils.addV(this.objects[0].pos, this.objects[3].pos),
      0.5,
    );
  }
  getAngle() {
    const vec = jutils.subV(this.objects[1].pos, this.objects[0].pos); //this.objects[1].pos.sub(this.objects[0].pos);
    const angle = Math.atan2(vec[1], vec[0]);
    const angle2 = angle - this.angle;
    return angle2;
  }
}

export class JRope extends JShape {
  constructor(positions, size) {
    super([], []);
    this.size = size;
    const radius = 10;
    this.objects = positions.map((pos) => new VerletObject(pos, radius));
    this.angles = [];
    const n = this.objects.length;
    for (let i = 0; i < n - 1; i++) {
      const vec = jutils.subV(this.objects[i + 1].pos, this.objects[i].pos); //this.objects[i + 1].pos.sub(this.objects[i].pos);
      const angle = Math.atan2(vec[1], vec[0]);
      this.angles.push(angle);
    }

    this.links = [];

    for (let i = 0; i < n - 1; i++) {
      const lhs = this.objects[i];
      const rhs = this.objects[i + 1];
      const len = jutils.lenV(jutils.subV(lhs.pos, rhs.pos)); //lhs.pos.sub(rhs.pos).len();
      this.links.push(new Link(lhs, rhs, len));
    }
  }
  getPosition() {
    const n = this.objects.length;
    const res = [];
    for (let i = 0; i < n - 1; i++) {
      const pos = jutils.mulS(
        jutils.addV(this.objects[i].pos, this.objects[i + 1].pos),
        0.5,
      ); //this.objects[i].pos.add(this.objects[i + 1].pos).mul(0.5);
      res.push(pos);
    }
    return res;
  }
  getAngle() {
    const n = this.objects.length;
    const res = [];
    for (let i = 0; i < n - 1; i++) {
      const vec = jutils.subV(this.objects[i + 1].pos, this.objects[i].pos); //this.objects[i + 1].pos.sub(this.objects[i].pos);
      const angle = Math.atan2(vec[1], vec[0]);
      const angle2 = angle - this.angles[i];
      res.push(angle2);
    }
    return res;
  }
}
