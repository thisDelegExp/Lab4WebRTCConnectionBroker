import h from './helpers.js';

window.addEventListener( 'load', () => {
    const room = h.getQString( location.href, 'room' );
    const username = sessionStorage.getItem( 'username' );

    if ( !room ) {
        document.querySelector( '#room-create' ).attributes.removeNamedItem( 'hidden' );
    }

    else if ( !username ) {
        document.querySelector( '#username-set' ).attributes.removeNamedItem( 'hidden' );
    }

    else {
        let commElem = document.getElementsByClassName( 'room-comm' );

        for ( let i = 0; i < commElem.length; i++ ) {
            commElem[i].attributes.removeNamedItem( 'hidden' );
        }

        var pc = [];

        let socket = io( '/stream' );

        var socketId = '';
        var myStream = '';
        var screen = '';

        //Get user video by default
        getAndSetUserStream();


        socket.on( 'connect', () => {
            //set socketId
            socketId = socket.io.engine.id;


            socket.emit( 'subscribe', {
                room: room,
                socketId: socketId
            } );


            socket.on( 'new user', ( data ) => {
                socket.emit( 'newUserStart', { to: data.socketId, sender: socketId } );
                pc.push( data.socketId );
                init( true, data.socketId );
            } );


            socket.on( 'newUserStart', ( data ) => {
                pc.push( data.sender );
                init( false, data.sender );
            } );


            socket.on( 'ice candidates', async ( data ) => {
                data.candidate ? await pc[data.sender].addIceCandidate( new RTCIceCandidate( data.candidate ) ) : '';
            } );


            socket.on( 'sdp', async ( data ) => {
                if ( data.description.type === 'offer' ) {
                    data.description ? await pc[data.sender].setRemoteDescription( new RTCSessionDescription( data.description ) ) : '';

                    h.getUserFullMedia().then( async ( stream ) => {
                        if ( !document.getElementById( 'local' ).srcObject ) {
                            h.setLocalStream( stream );
                        }

                        myStream = stream;

                        stream.getTracks().forEach( ( track ) => {
                            pc[data.sender].addTrack( track, stream );
                        } );

                        let answer = await pc[data.sender].createAnswer();

                        await pc[data.sender].setLocalDescription( answer );

                        socket.emit( 'sdp', { description: pc[data.sender].localDescription, to: data.sender, sender: socketId } );
                    } ).catch( ( e ) => {
                        console.error( e );
                    } );
                }

                else if ( data.description.type === 'answer' ) {
                    await pc[data.sender].setRemoteDescription( new RTCSessionDescription( data.description ) );
                }
            } );


            socket.on( 'chat', ( data ) => {
                h.addChat( data, 'remote' );
            } );
        } );


        function getAndSetUserStream() {
            h.getUserFullMedia().then( ( stream ) => {
                myStream = stream;

                h.setLocalStream( stream );
            } ).catch( ( e ) => {
                console.error( `stream error: ${ e }` );
            } );
        }

        function init( createOffer, partnerName ) {
            pc[partnerName] = new RTCPeerConnection( h.getIceServer() );

            if ( screen && screen.getTracks().length ) {
                screen.getTracks().forEach( ( track ) => {
                    pc[partnerName].addTrack( track, screen );
                } );
            }

            else if ( myStream ) {
                myStream.getTracks().forEach( ( track ) => {
                    pc[partnerName].addTrack( track, myStream );
                } );
            }

            else {
                h.getUserFullMedia().then( ( stream ) => {
                    myStream = stream;

                    stream.getTracks().forEach( ( track ) => {
                        pc[partnerName].addTrack( track, stream );
                    } );

                    h.setLocalStream( stream );
                } ).catch( ( e ) => {
                    console.error( `stream error: ${ e }` );
                } );
            }

            if ( createOffer ) {
                pc[partnerName].onnegotiationneeded = async () => {
                    let offer = await pc[partnerName].createOffer();

                    await pc[partnerName].setLocalDescription( offer );

                    socket.emit( 'sdp', { description: pc[partnerName].localDescription, to: partnerName, sender: socketId } );
                };
            }

            pc[partnerName].onicecandidate = ( { candidate } ) => {
                socket.emit( 'ice candidates', { candidate: candidate, to: partnerName, sender: socketId } );
            };

            pc[partnerName].ontrack = ( e ) => {
                let str = e.streams[0];
                if ( document.getElementById( `${ partnerName }-video` ) ) {
                    document.getElementById( `${ partnerName }-video` ).srcObject = str;
                }

                else {
                    let newVid = document.createElement( 'video' );
                    newVid.id = `${ partnerName }-video`;
                    newVid.srcObject = str;
                    newVid.autoplay = true;
                    newVid.className = 'remote-video';

                    let controlDiv = document.createElement( 'div' );
                    controlDiv.className = 'remote-video-controls';
                    controlDiv.innerHTML = `<i class="fa fa-microphone text-white pr-3 mute-remote-mic" title="Mute"></i>
                        <i class="fa fa-expand text-white expand-remote-video" title="Expand"></i>`;

                    let cardDiv = document.createElement( 'div' );
                    cardDiv.className = 'card card-sm';
                    cardDiv.id = partnerName;
                    cardDiv.appendChild( newVid );
                    cardDiv.appendChild( controlDiv );
                    document.getElementById( 'videos' ).appendChild( cardDiv );

                    h.adjustVideoElemSize();
                }
            };



            pc[partnerName].onconnectionstatechange = ( d ) => {
                switch ( pc[partnerName].iceConnectionState ) {
                    case 'disconnected':
                    case 'failed':
                        h.closeVideo( partnerName );
                        break;

                    case 'closed':
                        h.closeVideo( partnerName );
                        break;
                }
            };



            pc[partnerName].onsignalingstatechange = ( d ) => {
                switch ( pc[partnerName].signalingState ) {
                    case 'closed':
                        console.log( "Signalling state is 'closed'" );
                        h.closeVideo( partnerName );
                        break;
                }
            };
        }



        function shareScreen() {
            h.shareScreen().then( ( stream ) => {
                h.toggleShareIcons( true );

                screen = stream;

                broadcastNewTracks( stream, 'video', false );
                screen.getVideoTracks()[0].addEventListener( 'ended', () => {
                    stopSharingScreen();
                } );
            } ).catch( ( e ) => {
                console.error( e );
            } );
        }



        function stopSharingScreen() {
            h.toggleVideoBtnDisabled( false );

            return new Promise( ( res, rej ) => {
                screen.getTracks().length ? screen.getTracks().forEach( track => track.stop() ) : '';

                res();
            } ).then( () => {
                h.toggleShareIcons( false );
                broadcastNewTracks( myStream, 'video' );
            } ).catch( ( e ) => {
                console.error( e );
            } );
        }



        function broadcastNewTracks( stream, type, mirrorMode = true ) {
            h.setLocalStream( stream, mirrorMode );

            let track = type == 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];

            for ( let p in pc ) {
                let pName = pc[p];

                if ( typeof pc[pName] == 'object' ) {
                    h.replaceTrack( track, pc[pName] );
                }
            }
        }

        document.getElementById( 'toggle-video' ).addEventListener( 'click', ( e ) => {
            e.preventDefault();

            let elem = document.getElementById( 'toggle-video' );

            if ( myStream.getVideoTracks()[0].enabled ) {
                e.target.classList.remove( 'text-white' );
                e.target.classList.add( 'text-danger' );
                elem.setAttribute( 'title', 'Show Video' );

                myStream.getVideoTracks()[0].enabled = false;
            }

            else {
                e.target.classList.remove( 'text-danger' );
                e.target.classList.add( 'text-white' );
                elem.setAttribute( 'title', 'Hide Video' );

                myStream.getVideoTracks()[0].enabled = true;
            }

            broadcastNewTracks( myStream, 'video' );
        } );

        document.getElementById( 'toggle-mute' ).addEventListener( 'click', ( e ) => {
            e.preventDefault();

            let elem = document.getElementById( 'toggle-mute' );

            if ( myStream.getAudioTracks()[0].enabled ) {
                e.target.classList.remove( 'text-white' );
                e.target.classList.add( 'text-danger' );
                elem.setAttribute( 'title', 'Unmute' );

                myStream.getAudioTracks()[0].enabled = false;
            }

            else {
                e.target.classList.remove( 'text-danger' );
                e.target.classList.add( 'text-white' );
                elem.setAttribute( 'title', 'Mute' );

                myStream.getAudioTracks()[0].enabled = true;
            }

            broadcastNewTracks( myStream, 'audio' );
        } );

        document.getElementById( 'share-screen' ).addEventListener( 'click', ( e ) => {
            e.preventDefault();

            if ( screen && screen.getVideoTracks().length && screen.getVideoTracks()[0].readyState != 'ended' ) {
                stopSharingScreen();
            }

            else {
                shareScreen();
            }
        } );
    }
} );
