# Polyhedron Craft

An in-progress site where you try to build as many polyhedra you can using interactive versions of Conway operations.

Currently, *all code in this repo is AI-generated*, based primarily on the following design notes (with some additional nudging regarding repository structure and visuals):

Clicking and dragging a degree-n vertex inwards along a connected edge:
- Truncate (variable): break up vertex into n many degree-3 vertices surrounding an n-gon face
- Rectify/Ambo: new vertices combine along old edges, deleting old edges
- Mouse can be anywhere, but snap to the closest original edge when calculating how far it’s been dragged
- The new vertex on that edge should be exactly at the mouse’s snapped position
- Minimum position (no drag) and maximum position (rectify) are magnetic, and nothing happens if you go past them

Clicking and dragging the center of an n-gon face outwards along its normal:
- Kis (variable): break up face n many 3-gon faces surrounding an n-deg vertex
- Join: new faces combine along old edges, deleting old edges
- Mouse can be anywhere, but snap to a perpendicular line from the center when calculating how far it’s been dragged
- The new center vertex should be exactly at the mouse’s snapped position
- Minimum position (no drag) and maximum position (join) are magnetic, and nothing happens if you go past them

Holding shift while dragging a degree-2n vertex:
- Snub: break up the new face into n many 3-gon faces surrounding an n-gon face, or just an edge if n=2
- Same mouse behavior, except dragging along the edge stops truncating/rectifying and instead moves outward the vertices that are only part of the new 3-gon faces, and inward the vertices that are also part of the new n-gon face, skewing the proportions of the faces
- Whatever edge is dragged along is made to be only in a new 3-gon face, thus by moving your drag to an adjacent edge you can get the other chiral form
- The vertex on that edge should be exactly at the mouse’s snapped position

Holding shift while dragging a 2n-gon face:
- Gyro: break up new vertex into n many degree-3 vertices surrounding a degree-n vertex, or just an edge if n=2
- Mouse can still be anywhere, but now it snaps to the new edges connected to the new degree-n vertex
- Whatever edge is dragged along is made to have a new degree-3 vertex, thus by moving your drag to an adjacent edge you can get the other chiral form
- The new vertex on that edge should be exactly at the mouse’s snapped position

After releasing the mouse:
- Forces are applied to vertices in order to bring them into a correct configuration
- First, faces are made to be planar - if this does not converge after a certain amount of time, the polyhedron is invalid
- If faces are planar, then with some damping over time, forces are applied to vertices to try and make the faces regular

Holding command (MacOS) or control (non-MacOS) before dragging:
- Allows you to select multiple vertices (or multiple faces)
- When you start dragging, only the selected vertices (or faces) will be affected, instead of all of them
- The bounds for Rectify (or Join) is calculated based on what it would be if all the vertices (or faces) were selected
- Clicking off before dragging de-selects everything

Hovering:
- Highlights vertices and face-centers that are draggable
- Visual feedback when the mouse gets close enough that clicking and dragging would do something

Representing a polyhedron:
- Internally, a polyhedron should just be a list of vertex positions and how they are connected with edges/faces
- However, additional information should be kept in order to identify what polyhedron it is, specifically:
    - How many vertices of each vertex configuration there are, e.g. the snub square antiprism has 8 vertices with configuration 3.3.3.3.3, and 8 vertices with configuration 3.3.3.3.5
    - How man faces of each face configuration there are, e.g. the rhombic dodecahedron has 12 faces with configuration 3.4.3.4
    - (These configurations should be stored in some canonical form so that, e.g. 3.4.3.4 is treated the same as 4.3.4.3)
- Keep a list of named polyhedra (I can fill this in with lots of polyhedra later) and if the information matches, display the name
- Also check in the background with brute-force whether you can find a one-to-one mapping of vertices between the two (obviously, only trying options that have the same vertex configuration) that share the same connectivity - if so display a checkmark meaning we can verify that it’s the same
