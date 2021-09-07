import { fromEvent, interval } from 'rxjs'; 
import { map, filter, merge, scan } from 'rxjs/operators';

const 
  Constants = new class {
    readonly CanvasSize = 600;
    readonly BallXY = 300;
    readonly BallWidth = 10;
    readonly BallHeight = 10;
    readonly BallXVelocity = 1;
    readonly BallYVelocity = 1.25;
    readonly PaddleWidth = 20;
    readonly PaddleHeight = 70;
    readonly PaddlePlayerX = 20;
    readonly PaddlePCX = 550;
    readonly PaddleY = 265;
    readonly PaddleYVelocity = 1;
    readonly Scale = 20;
    readonly StartTime = 0;
    readonly WinScore = 7;
  },

  // Curried function used to check if an object is within bounds of the canvas. Adapted from FRP Asteroids' TorusWrap function
  checkBounds = ({x, y}: Vec) => (n: number) => {
      const h = Constants.CanvasSize,
        bound = (v: number) => 
        v < 0 ? 0 : v + n > h ? h - n : v;
    return new Vec(bound(x), bound(y))
  }

  type Key = 'ArrowUp' | 'ArrowDown'
  type Event = 'keydown' | 'keyup'

// Vector class from FRP Asteroids course notes
class Vec {
  constructor(public readonly x: number = 0, public readonly y: number = 0) {}
  add = (b:Vec) => new Vec(this.x + b.x, this.y + b.y)
  sub = (b:Vec) => this.add(b.scale(-1))
  len = ()=> Math.sqrt(this.x*this.x + this.y*this.y)
  scale = (s:number) => new Vec(this.x*s,this.y*s)
  ortho = ()=> new Vec(this.y,-this.x)

  static Zero = new Vec();
}

// A simple, seedable, pseudo-random number generator from week 4's observableexamples.ts
class RNG {
  // LCG using GCC's constants
  m = 0x80000000// 2**31
  a = 1103515245
  c = 12345
  state:number
  constructor(seed) {
    this.state = seed ? seed : Math.floor(Math.random() * (this.m - 1));
  }
  nextInt() {
    this.state = (this.a * this.state + this.c) % this.m;
    return this.state;
  }
  nextFloat() {
    // returns in range [0,1]
    return this.nextInt() / (this.m - 1);
  }
}
 // an instance of the Random Number Generator with a specific seed
 const rng = new RNG(20)
 // return a random number in the range [-1,1]
 const nextRandom = ()=>rng.nextFloat()*2 - 1


function pong() {
    // Inside this function you will use the classes and functions 
    // from rx.js
    // to add visuals to the svg element in pong.html, animate them, and make them interactive.
    // Study and complete the tasks in observable examples first to get ideas.
    // Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/ 
    // You will be marked on your functional programming style
    // as well as the functionality that you implement.
    // Document your code!

class Translate { constructor(public readonly v: Vec) {} }
class Tick { constructor(public readonly elapsed:number) {} }


/*
  Curried function adapted from FRP Asteroids' observeKey function that observes for key presses and uses it to move the player paddle.
*/
const observeKey = <T> (e:Event) => (k:Key) => (result:()=>T) =>
    fromEvent<KeyboardEvent>(document,e)
      .pipe(
        filter(({code})=>code === k),
        filter(({repeat})=>!repeat),
        map(result)),
    startMoveUp = observeKey('keydown')('ArrowUp')(()=>new Translate(new Vec(0, 3))),
    startMoveDown = observeKey('keydown')('ArrowDown')(()=>new Translate(new Vec(0, -3))),
    stopMoveUp = observeKey('keyup')('ArrowUp')(()=>new Translate(new Vec(0, 0))),
    stopMoveDown = observeKey('keyup')('ArrowDown')(()=>new Translate(new Vec (0, 0)));
  
  // Readonly Body type adapted from FRP Asteroids' Body type
  type Body = Readonly<{
    id: string
    w: number,
    h: number,
    pos: Vec, 
    vel: Vec,
    acc: Vec,
    createTime: number
  }>

  // Readonly State type adapted from FRP Asteroids' State type
  type State = Readonly<{
    paddlePlayer: Body,
    paddlePC: Body,
    ball: Body,
    playerScore: number,
    PCScore: number,
    gameOver: boolean,
    winner: string,
    time: number
  }>

  // Function adapted from FRP Asteroids' createShip() that returns a Body for Ball object with specified position, velocity and time.
  function createBall (pos: Vec, vel: Vec, t: number): Body {
    return {
      id: 'ball',
      w: Constants.BallWidth,
      h: Constants.BallHeight,
      pos: pos,
      vel: vel,
      acc: Vec.Zero,
      createTime: t
    }
  }

  // Function adapted from FRP Asteroids' createShip() that returns a Body for Paddle object with specified position, velocity and time.
  function createPaddle(pos:Vec, vel: Vec, t: number):Body{
    return<Body>{
      id: 'paddle',
      w: Constants.PaddleWidth,
      h: Constants.PaddleHeight,
      pos: pos,
      vel: vel,
      acc: Vec.Zero,
      createTime: t
    }
  }

  // Initialises a state with all the required components of the game. Adapted from FRP Asteroids' initialState
  const initialState: State = {
    paddlePlayer: createPaddle(new Vec(Constants.PaddlePlayerX, Constants.PaddleY), Vec.Zero, Constants.StartTime),
    paddlePC: createPaddle(new Vec(Constants.PaddlePCX, Constants.PaddleY), Vec.Zero, Constants.StartTime),
    ball: createBall(new Vec(Constants.BallXY, Constants.BallXY), new Vec(Constants.BallXVelocity, Constants.BallYVelocity), Constants.StartTime),
    playerScore: 0,
    PCScore: 0,
    gameOver: false,
    winner: "winner:",
    time: Constants.StartTime
  },

  // Function adapted from FRP Asteroids' moveObj function used to move the paddle
  moveObjPaddle = (o:Body) => <Body>{
    ...o,
    pos:checkBounds(o.pos.sub(o.vel))(o.h), // Makes sure that when a paddle moves, it stays within the bounds of the canvas.
    vel: o.vel.add(o.acc)
  },

  // Function adapted from FRP Asteroids' moveObj function used to move the ball
  moveObjBall = (o:Body) => <Body>{
    ...o,
    pos:o.pos.sub(o.vel),
    vel: o.vel.add(o.acc)
  },

  /* 
     Curried function adapted from FRP Asteroids' handleCollisions function that consists of multiple inner immutable 
     functions and variables that takes in two States, the current state and the initial state, which returns a deep copy of the current state where:
    - Possible collisions and the actions taken when collisions happen are managed. 
    - The function keeps track of the score of each player and determines whether the game has ended.
    - Resets the ball when it goes out of bound (i.e when a player wins a round).
    - Determines the movement of the non-player paddle to follow the y-velocity of the ball.
    - Determines the winner of a round.
    - Restarts the game to its initial state when a game has a winner.
  */
  handleMoveCollisions = (s: State) => (t: State) => {
    const

      //Change the velocity of the ball depending on where it hits 
      //the paddle; velocity increases as it hits nearer to the edge and the velocity decreases as it hits nearer towards the centre of the paddle.
      changeVel = (p: Body) => (b: Body) => {
        const pCentre = p.pos.y + (p.h/2),
              bCentre = b.pos.y + (b.h/2),
              collidePoint = (pCentre - bCentre) < 0 ? (pCentre - bCentre) * -1 : pCentre - bCentre, // Makes sure that the value calculated is always positive.

              scale =  0.5 + ((collidePoint - p.h/8)/Constants.Scale),
              newVelY = s.ball.vel.y * scale
              return newVelY
      },
      /*
        (Coordinates of an object)
        top: obj.pos.y
        bottom: obj.pos.y + obj.h
        left: obj.pos.x
        right: obj.pos.x + obj.w

        collision: a curried function that checks whether or not:
          - the bottom of the ball and the top of the paddle overlaps.
          - the top of the ball and the bottom of the paddle overlaps.
          - the right of the ball and the left of the paddle overlaps.
          - the left of the ball and the right of the paddle overlaps.
        detectCollision: a curried function that calls the collision function and is used to detect if the left of two objects are equal.
      */
      collision = (p: Body) => (b: Body) => !((b.pos.y + b.h) < p.pos.y || b.pos.y > (p.pos.y + p.h) || (b.pos.x + b.w) < p.pos.x || b.pos.x > (p.pos.x + p.w)),
      detectCollision = (p: Body) => (b: Body) => p.pos.x == b.pos.x && collision(p)(b),
      
      ballPlayerCollision = detectCollision(s.paddlePlayer)(s.ball), // Detects the collision between the player paddle and the ball
      ballPCCOllision = detectCollision(s.paddlePC)(s.ball), // Detects the collision between the non-player paddle and the ball
      ballWallBound = s.ball.pos.y + s.ball.h > Constants.CanvasSize || s.ball.pos.y < 0, // Detects the collision between the horizontal borders of the canvas and the ball
      ballLeftBound = s.ball.pos.x < 0, //Checks if the ball goes beyond the left side of the canvas
      ballRightBound = s.ball.pos.x > Constants.CanvasSize, //Checks if the ball goes beyond the right side of the canvas

      // Updates the velocity of the ball based on the state of collision of the ball.
      updateBallVec = 
        ballPlayerCollision ? new Vec(-s.ball.vel.x, changeVel(s.paddlePlayer)(s.ball)) // Checks if collision between the player paddle and the ball has happened
        : ballPCCOllision ? new Vec(-s.ball.vel.x, changeVel(s.paddlePC)(s.ball)) // Checks if collision between the non-player paddle and the ball has happened
        : ballWallBound ? new Vec(s.ball.vel.x, -s.ball.vel.y) // Checks if collision between the ball and the horizontal bounds of the canvas has happened
        : s.ball.vel, // Returns the current ball velocity when no collision occurs
      // Update the ball based on the state of collision of the ball
      ballUpdate = createBall(s.ball.pos, updateBallVec, s.ball.createTime),
      // Checks if the ball is out of bound, reset the ball, else return ballUpdate
      //  (When the ball resets, the velocity of the ball is randomised so that it respawns in different directions. nextRandom() uses Math.Random(), nextRandom() may be impure.)
      resetBall = ballLeftBound || ballRightBound ? createBall(new Vec(Constants.BallXY, Constants.BallXY), new Vec(Constants.BallXVelocity * (nextRandom() > 0.5 ? 1 : -1), Constants.BallYVelocity * (nextRandom() * 2 - 1)), s.ball.createTime) : ballUpdate,

      // updatePCVec, updatePaddlePC and resetPaddlePC are functions used to update the velocity of the non-player paddle to follow the velocity of the ball. 
      updatePCVec = new Vec(s.paddlePC.vel.x, s.ball.vel.y),
      updatePaddlePC = createPaddle(s.paddlePC.pos, updatePCVec, s.paddlePC.createTime),
      resetPaddlePC = ballLeftBound || ballRightBound ? createPaddle(new Vec(Constants.PaddlePCX, Constants.PaddleY), Vec.Zero, s.paddlePC.createTime) : updatePaddlePC,

      // Update the player score
      updatePlayerScore = ballRightBound ? s.playerScore + 1 : s.playerScore, // When the player wins a round
      updatePCScore = ballLeftBound ? s.PCScore + 1 : s.PCScore, // When the non-player wins a round
      
      endGame = updatePlayerScore === Constants.WinScore || updatePCScore === Constants.WinScore, // Checks if the game is over and update the winner
      checkWinner = updatePlayerScore === Constants.WinScore ? "winner: user" : updatePCScore === Constants.WinScore ? "winner: PC" : s.winner // Determines the winner of a round
    
    // If the game has ended, it returns back the initialState with the winner updated.
    return endGame ? <State>{
      ...t,
      winner: checkWinner
    } 
    
    // If the game has not ended yet, it returns the deep copy of the current state after handleMoveCollisions function is executed.
    : <State>{
      ...s,
      paddlePC: resetPaddlePC,
      ball: resetBall,
      playerScore: updatePlayerScore,
      PCScore: updatePCScore,
      gameOver: endGame
    }
  }

  /*
      Adapted from FRP Asteroids' tick function where it takes a state and the elapsed time as its parameters and returns a deep copy a the state that has been applied handleMoveFunctions
      and has updated its elapsed time.
  */
  const tick = (s:State) => (elapsed:number) => 
    handleMoveCollisions({...s,
      paddlePlayer: moveObjPaddle(s.paddlePlayer),
      paddlePC: moveObjPaddle(s.paddlePC),
      ball: moveObjBall(s.ball), 
      time: elapsed
    })(initialState)


  /*
      Adapted from FRP Asteroids' reduceState function whereby it takes a state and a parameter that is an instance of either Translate or Tick.
      If it is an instance of Translate, it will update the velocity of the player paddle. Else, the tick function will be called with the time elapsed passed into the function.
  */
  const reduceState = (s:State, e:Translate|Tick)=>
      e instanceof Translate ? {...s,
        paddlePlayer: {...s.paddlePlayer, vel: e.v}      
      } :
      tick(s)(e.elapsed);

  /*
      Adapted from FRP Asteroids' subsciption function where it merges all key obervables event and every 10 ms interval maps a number into a new Tick object, 
      reduces the initialState with the reduceState function and in turn subscribes everything to updateView.
  */
  const subscription = interval(10)
  .pipe(
    map(elapsed=>new Tick(elapsed)),
    merge(
      startMoveUp,startMoveDown,stopMoveUp,stopMoveDown),
    scan(reduceState, initialState)
  ).subscribe(updateView);

  /*
      Adapted from FRP Asteroids' updateView function where accesses all the element needed for the game from the html file, and updates/sets its attributes accordingly.
  */
  function updateView(s:State) {
    const 
          paddlePlayer = document.getElementById("rectPlayer")!,
          paddlePC = document.getElementById("rectPC")!,
          ball = document.getElementById("ball")!,
          playerScore = document.getElementById("playerScore")!,
          PCScore = document.getElementById("PCScore")!,
          winner = document.getElementById("winTracker")!,
          attr = (e:Element,o:Object) => { for(const k in o) e.setAttribute(k,String(o[k])) };
    
    attr(paddlePlayer, {transform: `translate(${s.paddlePlayer.pos.x}, ${s.paddlePlayer.pos.y})`}) // Updates the position of the player paddle.
    attr(paddlePC, {transform: `translate(${s.paddlePC.pos.x}, ${s.paddlePC.pos.y})`}) // Updates the position of the non-player paddle.
    attr(ball, {transform: `translate(${s.ball.pos.x}, ${s.ball.pos.y})`}) // Updates the position of the ball.

    playerScore.textContent = String(s.playerScore) // Updates the player score.
    PCScore.textContent = String(s.PCScore) // Updates the non-player score.
    winner.textContent = String(s.winner) // Updates the winner of each round.
  }

}

// the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != 'undefined')
  window.onload = ()=>{
    pong();
  }