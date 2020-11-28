import * as express from 'express';
import * as morgan from 'morgan';
import * as bodyParser from 'body-parser';
import * as socketio from 'socket.io';
import * as http from 'http';

class ConnectionBroker {
  public app: express.Application;
  private server: http.Server;
  public io: SocketIO.Server;
  private port = process.env.PORT;

  public static bootstrap(): ConnectionBroker {
    return new ConnectionBroker();
  } 

  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketio().listen(this.server);
    this.config();
    this.setupSocket();
  }

  private config() {
    // this.app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    //   const origin = req.header('Origin');
    //   res.header('Access-Control-Allow-Origin', origin);
    // });

    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));

    this.app.use(morgan('dev'));

    this.app.get('/', (req, res) => {
      res.send('Connection broker started');
    });

    this.server.listen(this.port, () => {
      console.log(`Server is listening on ${this.port}`);
    });
  }

  private setupSocket() {
    this.io.on('connection', (socket: SocketIO.Socket) => {
      console.log(`Socket ${socket.id} connected`);
      // forward WebRTC messages
      socket.on('api/v1/webrtc/peermessage', (data: any) => {
        console.log('Forward WebRTC peer message:', JSON.stringify(data));
        socket.broadcast.emit('api/v1/webrtc/peermessage', data);
      });

      socket.on('api/v1/webrtc/connect-to-chat', (data: any) => {
        console.log(`Client ${socket.id} connected to room`);
        socket.broadcast.emit('api/v1/webrtc/peer-connected', {
          id: socket.id
        });
      });

    });
  }
}

ConnectionBroker.bootstrap();