import * as express from 'express';
import * as morgan from 'morgan';
import * as bodyParser from 'body-parser';
import * as socketio from 'socket.io';
import * as http from 'http';

class ConnectionBroker {
  public app: express.Application;
  private server: http.Server;
  public io: SocketIO.Server;
  private port = process.env.PORT ?? 3000;

  public static bootstrap(): ConnectionBroker {
    return new ConnectionBroker();
  } 

  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketio(this.server);
    this.config();
    this.setupSocket();
    this.server.listen(this.port, () => {
      console.log(`Server is listening on ${this.port}`);
    });
  }

  private config() {
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));

    this.app.use(morgan('dev'));

    this.app.use('/', express.static('public'));

  }

  private setupSocket() {
    this.io.on('connection', (socket: SocketIO.Socket) => {
      console.log(`Socket ${socket.id} connected`);
      socket.on('join', (roomId: any) => {
        const roomClients = this.io.sockets.adapter.rooms[roomId] || { length: 0 }
        const numberOfClients = roomClients.length;
    
        if (numberOfClients == 0) {
          console.log(`Creating room ${roomId} and emitting room_created socket event`)
          socket.join(roomId)
          socket.emit('room_created', roomId)
        } else if (numberOfClients < 10) {
          console.log(`Joining room ${roomId} and emitting room_joined socket event`)
          socket.join(roomId)
          socket.emit('room_joined', roomId)
        } else {
          console.log(`Can't join room ${roomId}, emitting full_room socket event`)
          socket.emit('full_room', roomId)
        }
      });

      // These events are emitted to all the sockets connected to the same room except the sender.
      socket.on('start_call', (roomId: any) => {
        console.log(`Broadcasting start_call event to peers in room ${roomId}`)
        socket.broadcast.to(roomId).emit('start_call')
      })
      socket.on('webrtc_offer', (event: any) => {
        console.log(`Broadcasting webrtc_offer event to peers in room ${event.roomId}`)
        socket.broadcast.to(event.roomId).emit('webrtc_offer', event.sdp)
      })
      socket.on('webrtc_answer', (event: any) => {
        console.log(`Broadcasting webrtc_answer event to peers in room ${event.roomId}`)
        socket.broadcast.to(event.roomId).emit('webrtc_answer', event.sdp)
      })
      socket.on('webrtc_ice_candidate', (event: any) => {
        console.log(`Broadcasting webrtc_ice_candidate event to peers in room ${event.roomId}`)
        socket.broadcast.to(event.roomId).emit('webrtc_ice_candidate', event)
      })

    });
  }
}

ConnectionBroker.bootstrap();