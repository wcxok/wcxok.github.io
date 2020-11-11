'use strict';

let webrtc = null;
let joined = false;
let rooms = new Map();
let $index = $('#index');
let $appid = $('#appid');
let $roomid = $('#roomid');
let $uid = $('#uid');
let $token = $('#token');
let $form = $("form");

let $join = $('#join');
let $leave = $('#leave');
let $tips = $('#tip')

$form.submit(async function (e) {
    e.preventDefault();
    await join();
});
$index.change(() => {
    $uid.val('');
});
$leave.click(() => {
    leave();
});
async function join () {
    try {
        let index = parseInt($index.val());
        let appId = parseInt($appid.val());
        let roomid = $roomid.val();
        let uid = $uid.val();
        let token = $token.val();

        let flagId = `${appId}:${roomid}:${uid}`;

        let params = {
            index,
            appId,
            roomid,
            uid,
            flagId,
            joined: false,
            ownerUid: null,
            webrtc: null,
            timer: null,
            hasStream: false
        }
        if (!validator(params)) return;
        if (rooms.get(flagId)) {
            if (rooms.get(flagId).joined) {
                return;
            }
        } else {
            rooms.set(flagId, params);
        }

        if (isNaN(appId)) {
            warn('AppId must be number');
            return;
        }

        webrtc = new WebRTC();
        let err = webrtc.init(appId);

        params.webrtc = webrtc
        if (err === null) {
            console.log('init success');
        } else {
            warn(err.error);
            return;
        }
        
        webrtc.on('remote_stream_add', async (ev, remoteStream) => {
            if ($(`#view-${index}`).children().is('.no-stream')) {
                $(`#view-${index}`).find('.no-stream').remove()
            }
            await webrtc.subscribe(remoteStream);

            params.ownerUid = remoteStream.uid
            let divId = createUserDiv(index, remoteStream.uid, params);

            await webrtc.play(remoteStream.uid, divId);

            params.hasStream = true
            rooms.set(flagId, params);
        });

        webrtc.on('remote_stream_remove', async (ev, remoteStream) => {
            let flagId = `${appId}:${roomid}:${uid}`;
            let room = rooms.get(flagId);
            if (room) {
                room.webrtc.unsubscribe(remoteStream);
                removeUserDiv(room.index);
                rooms.delete(flagId);
                $(`#view-${index}`).html('<span class="no-stream">主播关闭视频流</span>')
            }
        });

        params.timer = setInterval(() => {
            getMediaStat(flagId, index)
        }, 1000)

        if (!token) {
            token = undefined;
        }
        // join room
        await webrtc.joinRoom({
            uid: uid,
            roomId: roomid,
            token: token,
        });
        
        params.joined = true
        rooms.set(flagId, params);

        if (!params.hasStream) {
            $(`#view-${index}`).html('<span class="no-stream">暂无视频流</span>')
        }
    } catch (e) {
        if (e && e.error) {
            console.warn(e.error);
        } else {
            console.warn(e);
        }
        if (webrtc) {
            webrtc.leaveRoom();
            joined = false;
        }
    }
}

function validator (params) {
    let _return = true
    for (let room of rooms) {
        if (room[1].index === params.index) {
            $tips.html('当前位置已有视图，请选择其他的视图')
            _return = false
            return false
        }
        if (room[1].appId === params.appId) {
            if (params.roomid === room[1].roomId) {
                if (params.uid === room[1].uid) {
                    $tips.html('该uid 用户已登录')
                    _return = false
                    return false
                }
            }
        }
    }
    return _return
}

function leave () {
    let index = parseInt($index.val());
    let appId = parseInt($appid.val());
    let roomid = $roomid.val();
    let uid = $uid.val();
    let flagId = `${appId}:${roomid}:${uid}`;

    let room = rooms.get(flagId)
    if (!room) return;
    if (room.index !== index) {
        $tips.html('当前索引的用户不存在');
        return
    }
    if (room.roomId !== roomid) {
        $tips.html('当前房间的用户不存在');
        return
    }
    
    room.webrtc.leaveRoom();
    clearInterval(room.timer);
    rooms.delete(flagId);
    $tips.html('');
    removeUserDiv(room.index);
}

function getMediaStat (flagId, index) {
    if (!webrtc) {
        return;
    }
    let _room = rooms.get(flagId)
    let userStat = {};
    var downlinkAudioStats = _room.webrtc.getDownlinkAudioStats();
    var downlinkVideoStats = _room.webrtc.getDownlinkVideoStats();
    var hasAudio = _room.webrtc.hasAudio(_room.ownerUid);
    
    let rets = [downlinkAudioStats ,downlinkVideoStats];
    let ownerid = null
    for (let ret of rets) {
        if (ret.result) {
            for (let [uid, t] of ret.result.entries()) {
                userStat[uid] = Object.assign({}, userStat[uid], t, { hasAudio });
                ownerid = uid;
            }
        }
    }
    
    if (userStat && userStat[ownerid]) {
        for (var room of rooms) {
            if (room[1].ownerUid === ownerid) {
                removeMediaStatDiv(index);
                createMediaStatDiv(index, userStat[ownerid]);
            }
        }
    }
}

function createMediaStatDiv (index, stat) {
    let div = $(`#view-${index}`);
    let network = `<img src="../static/img/network_${stat.networkScore}.png" />`
    let voice = `<img src="../static/img/voice-${stat.audioLevel}.png" />`
    let muteVoice = stat.hasAudio
        ? '<img src="../static/img/voice-5.png" />'
        : '<img src="../static/img/voice-enable.png" />'
    div.append(`<div id="state" class="label label-info" style="position: absolute; right: 0;
    top: 0; z-index: 1;min-width:120px;">
        <div>网络质量: ${stat && stat.networkScore || 0} ${network}</div>
        <div>音频音量: ${stat.audioLevel} ${voice}</div>
        <div>视频码率: ${stat.videoBitRate}</div>
        <div>音频码率: ${stat.audioBitRate}</div>
        <div>Mute状态: ${!stat.hasAudio} ${muteVoice}</div>
    </div>`);
}

function removeMediaStatDiv (index) {
    let div = $(`#view-${index}`);
    div.find('#state').remove();
}

function onNetworkScore (ev, data) {
    updateNetworkScore(data.uplinkNetworkScore, data.downlinkNetworkScore);
}

function updateNetworkScore (upScore, downScore) {
    console.log(upScore, downScore)
}

function createUserDiv (index, uid, params) {
    let div = $(`#view-${index}`);
    div.append(`<div class="label label-info" style="position: absolute; left: 0;
    top: 0; z-index: 1;">
        <div>${index}</div>
        <div>appid: ${params.appId}</div>
        <div>roomid: ${params.roomid}</div>
        <div>uid: ${params.uid}</div>
    </div>`);
    let innerDiv = $("<div style='height: 100%; width: 100%;'></div>");
    div.append(innerDiv);
    let mediaId = 'media-' + index;
    let mediaDiv = $("<div class='media'></div>").attr('id', mediaId);
    innerDiv.append(mediaDiv);
    let statDiv = $(`<div id='stat-${uid}' class='label label-info' style='position: absolute; left: 0; bottom: 0; z-index: 1;'>主播uid：${uid}</div>`);
    innerDiv.append(statDiv);
    return mediaId;
}

function removeUserDiv (index) {
    $(`#view-${index}`).children().remove();
}

// 输出下行音量
function getDownVolumeScore (room) {
    var downlinkAudioStats = room.webrtc.getDownlinkAudioStats();
    let rets = downlinkAudioStats
    if (rets && rets.result && rets.result.get(room.ownerUid)) {
        return Number(rets.result.get(room.ownerUid).audioLevel)
    }
    return 0
}