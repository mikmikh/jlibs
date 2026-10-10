
// 0 1 2
// 3 4 5
// 6 7 8
function determinant3(mat) {
    const d00 = mat[4]*mat[8]-mat[7]*mat[5];
    const d10 = mat[3]*mat[8]-mat[6]*mat[5];
    const d20 = mat[3]*mat[7]-mat[4]*mat[6];
    const res = mat[0]*d00-mat[1]*d10+mat[2]*d20;
    return res;
}

function getBigTriangle(points) {
    const count = points.length;
    const center = {x:0,y:0};
    const pointMin = {x:1e9,y:1e9};
    const pointMax = {x:-1e9,y:-1e9};
    points.forEach((point) => {
        center.x += point.x;
        center.y += point.y;

        pointMin.x = Math.min(pointMin.x, point.x);
        pointMin.y = Math.min(pointMin.y, point.y);

        pointMax.x = Math.max(pointMax.x, point.x);
        pointMax.y = Math.max(pointMax.y, point.y);
    });
    center.x /= count;
    center.y /= count;

    const dX = pointMax.x-pointMin.x;
    const dY = pointMax.y-pointMin.y;
    const dist = Math.sqrt(dX*dX+dY*dY);
    
    const v0 = {x: center.x, y: center.y+dist};
    const v1a = 2*Math.PI/3;
    const v1 = {
        x: Math.cos(v1a)*v0.x-Math.sin(v1a)*v0.y,
        y: Math.sin(v1a)*v0.x+Math.cos(v1a)*v0.y,
    };
    const v2a = 4*Math.PI/3;
    const v2 = {
        x: Math.cos(v2a)*v0.x-Math.sin(v2a)*v0.y,
        y: Math.sin(v2a)*v0.x+Math.cos(v2a)*v0.y,
    };
    return [v0,v1,v2];
}



function checkInsideCircumcircle(tri, d) {
    const [a,b,c] = tri;
    const mat = [
        a.x-d.x, a.y-d.y, (a.x-d.x)*(a.x-d.x)+(a.y-d.y)*(a.y-d.y),
        b.x-d.x, b.y-d.y, (b.x-d.x)*(b.x-d.x)+(b.y-d.y)*(b.y-d.y),
        c.x-d.x, c.y-d.y, (c.x-d.x)*(c.x-d.x)+(c.y-d.y)*(c.y-d.y),
    ];
    const det = determinant3(mat);
    return det > 0;
}

function checkClockwise(a,b,c) {
    const res = (b.x-a.x)*(b.y+a.y)+(c.x-b.x)*(c.y+b.y)+(a.x-c.x)*(a.y+c.y);
    return res > 0;
}
function splitTriangle(tri,d) {
    const [a,b,c] = tri;
    const tri0 = checkClockwise(d,a,b) ? [d,b,a] : [d,a,b];
    const tri1 = checkClockwise(d,b,c) ? [d,c,b] : [d,b,c];
    const tri2 = checkClockwise(d,c,a) ? [d,a,c] : [d,c,a];
    return [tri0,tri1,tri2];
}
function addPoint(tris, point) {
    const toRemove = new Set();
    const toAdd = [];
    // for (const tri of tris) {
    //     const inside = checkInsideCircumcircle(tri, point);
    //     if (!inside) {
    //         continue;
    //     }
    //     toRemove.add(tri);
    //     const newTris = splitTriangle(tri,point);
    //     toAdd.push(...newTris);
    //     break;
    // }
    tris.forEach((tri) => {
        const inside = checkInsideCircumcircle(tri, point);
        if (!inside) {
            return;
        }
        toRemove.add(tri);
        const newTris = splitTriangle(tri,point);
        toAdd.push(...newTris);
    });
    const res = tris.filter(tri => !toRemove.has(tri));
    for (const p of toAdd) {
        res.push(p);
    }
    
    return res;
}

export function lTriangulate(points) {
    let tris = [];
    const bigTri = getBigTriangle(points);
    bigTri[0].i=-1;
    bigTri[1].i=-1;
    bigTri[2].i=-1;
    tris.push(bigTri);
    let i = 0;
    for(const point of points) {
        point.i = i++;
        tris = addPoint(tris, point);
        // console.log(JSON.stringify(tris));
    }
    const edges = [];
    const visited = {};
    tris.forEach((tri) => {
        tri.forEach((p0,pi) => {
            const p1 = tri[(pi+1)%3];
            // console.log(p0,p1);
            if (p0.i===-1 || p1.i===-1) {
                return;
            }
            const edge = [p0.i, p1.i];
            edge.sort((a,b)=>a-b);
            const key = `${edge[0]}_${edge[1]}`;
            if (visited[key]) {
                return;
            }
            visited[key] = true;
            edges.push(edge);
        });
    });
    return edges;
}

