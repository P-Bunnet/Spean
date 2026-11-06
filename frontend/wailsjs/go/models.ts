export namespace config {
	
	export class Entry {
	    alias: string;
	    group?: string;
	    tags?: string[];
	    saved: boolean;
	    hostName?: string;
	    user?: string;
	    color?: string;
	    starred?: boolean;
	    lastConnect?: number;
	    theme?: string;
	    hasNotes?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Entry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.alias = source["alias"];
	        this.group = source["group"];
	        this.tags = source["tags"];
	        this.saved = source["saved"];
	        this.hostName = source["hostName"];
	        this.user = source["user"];
	        this.color = source["color"];
	        this.starred = source["starred"];
	        this.lastConnect = source["lastConnect"];
	        this.theme = source["theme"];
	        this.hasNotes = source["hasNotes"];
	    }
	}
	export class Favorite {
	    name: string;
	    cmd: string;
	    run: boolean;
	    exec?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Favorite(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.cmd = source["cmd"];
	        this.run = source["run"];
	        this.exec = source["exec"];
	    }
	}
	export class Forward {
	    kind: string;
	    listen: string;
	    target: string;
	    auto: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Forward(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.listen = source["listen"];
	        this.target = source["target"];
	        this.auto = source["auto"];
	    }
	}
	export class Node {
	    id: string;
	    hostname: string;
	    role: string;
	    status: string;
	    availability: string;
	    alias?: string;
	
	    static createFrom(source: any = {}) {
	        return new Node(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.hostname = source["hostname"];
	        this.role = source["role"];
	        this.status = source["status"];
	        this.availability = source["availability"];
	        this.alias = source["alias"];
	    }
	}
	export class GroupMeta {
	    kind?: string;
	    nodes?: Node[];
	    map?: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new GroupMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.nodes = this.convertValues(source["nodes"], Node);
	        this.map = source["map"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Step {
	    cmd: string;
	    note?: string;
	    confirm?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Step(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cmd = source["cmd"];
	        this.note = source["note"];
	        this.confirm = source["confirm"];
	    }
	}
	export class Runbook {
	    name: string;
	    steps: Step[];
	    exec?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Runbook(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.steps = this.convertValues(source["steps"], Step);
	        this.exec = source["exec"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SavedHost {
	    label: string;
	    address: string;
	    port: string;
	    user: string;
	    key: string;
	    jump: string;
	    group: string;
	    tags: string[];
	    forwardAgent: boolean;
	    snippet: string;
	    favorites?: Favorite[];
	    color?: string;
	    starred?: boolean;
	    order?: number;
	    lastConnect?: number;
	    forwards?: Forward[];
	    dockerSock?: string;
	    notes?: string;
	    theme?: string;
	
	    static createFrom(source: any = {}) {
	        return new SavedHost(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.label = source["label"];
	        this.address = source["address"];
	        this.port = source["port"];
	        this.user = source["user"];
	        this.key = source["key"];
	        this.jump = source["jump"];
	        this.group = source["group"];
	        this.tags = source["tags"];
	        this.forwardAgent = source["forwardAgent"];
	        this.snippet = source["snippet"];
	        this.favorites = this.convertValues(source["favorites"], Favorite);
	        this.color = source["color"];
	        this.starred = source["starred"];
	        this.order = source["order"];
	        this.lastConnect = source["lastConnect"];
	        this.forwards = this.convertValues(source["forwards"], Forward);
	        this.dockerSock = source["dockerSock"];
	        this.notes = source["notes"];
	        this.theme = source["theme"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Settings {
	    version: number;
	    fontFamily: string;
	    fontSize: number;
	    theme: string;
	    scrollback: number;
	    cursorStyle: string;
	    cursorBlink: boolean;
	    bell: boolean;
	    keepaliveSec: number;
	    confirmClose: boolean;
	    concurrency: number;
	    onboarded: boolean;
	    restore: string;
	    autoReconnect: boolean;
	    copyOnSelect: boolean;
	    keychain: boolean;
	    updateCheck: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.fontFamily = source["fontFamily"];
	        this.fontSize = source["fontSize"];
	        this.theme = source["theme"];
	        this.scrollback = source["scrollback"];
	        this.cursorStyle = source["cursorStyle"];
	        this.cursorBlink = source["cursorBlink"];
	        this.bell = source["bell"];
	        this.keepaliveSec = source["keepaliveSec"];
	        this.confirmClose = source["confirmClose"];
	        this.concurrency = source["concurrency"];
	        this.onboarded = source["onboarded"];
	        this.restore = source["restore"];
	        this.autoReconnect = source["autoReconnect"];
	        this.copyOnSelect = source["copyOnSelect"];
	        this.keychain = source["keychain"];
	        this.updateCheck = source["updateCheck"];
	    }
	}

}

export namespace forward {
	
	export class Forward {
	    id: string;
	    tabId: string;
	    kind: string;
	    listen: string;
	    target: string;
	    bytes: number;
	    err?: string;
	    active: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Forward(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.tabId = source["tabId"];
	        this.kind = source["kind"];
	        this.listen = source["listen"];
	        this.target = source["target"];
	        this.bytes = source["bytes"];
	        this.err = source["err"];
	        this.active = source["active"];
	    }
	}

}

export namespace main {
	
	export class Disk {
	    total: number;
	    used: number;
	    avail: number;
	    mount: string;
	
	    static createFrom(source: any = {}) {
	        return new Disk(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total = source["total"];
	        this.used = source["used"];
	        this.avail = source["avail"];
	        this.mount = source["mount"];
	    }
	}
	export class ExecResult {
	    stdout: string;
	    stderr: string;
	    exit: number;
	
	    static createFrom(source: any = {}) {
	        return new ExecResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.stdout = source["stdout"];
	        this.stderr = source["stderr"];
	        this.exit = source["exit"];
	    }
	}
	export class FileEntry {
	    name: string;
	    size: number;
	    mode: string;
	    isDir: boolean;
	    mtime: number;
	
	    static createFrom(source: any = {}) {
	        return new FileEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.size = source["size"];
	        this.mode = source["mode"];
	        this.isDir = source["isDir"];
	        this.mtime = source["mtime"];
	    }
	}
	export class HistEntry {
	    host: string;
	    cwd?: string;
	    cmd: string;
	    exit: number;
	    at: number;
	    n?: number;
	
	    static createFrom(source: any = {}) {
	        return new HistEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.host = source["host"];
	        this.cwd = source["cwd"];
	        this.cmd = source["cmd"];
	        this.exit = source["exit"];
	        this.at = source["at"];
	        this.n = source["n"];
	    }
	}
	export class KeyInfo {
	    name: string;
	    ref: string;
	    type: string;
	    fingerprint: string;
	    public: string;
	    encrypted: boolean;
	    source: string;
	
	    static createFrom(source: any = {}) {
	        return new KeyInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.ref = source["ref"];
	        this.type = source["type"];
	        this.fingerprint = source["fingerprint"];
	        this.public = source["public"];
	        this.encrypted = source["encrypted"];
	        this.source = source["source"];
	    }
	}
	export class ListenPort {
	    addr: string;
	    port: number;
	    proc?: string;
	
	    static createFrom(source: any = {}) {
	        return new ListenPort(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.addr = source["addr"];
	        this.port = source["port"];
	        this.proc = source["proc"];
	    }
	}
	export class Listing {
	    path: string;
	    entries: FileEntry[];
	
	    static createFrom(source: any = {}) {
	        return new Listing(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.entries = this.convertValues(source["entries"], FileEntry);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Preview {
	    kind: string;
	    text?: string;
	    data?: string;
	    size: number;
	    more: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Preview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.text = source["text"];
	        this.data = source["data"];
	        this.size = source["size"];
	        this.more = source["more"];
	    }
	}
	export class Progress {
	    alias: string;
	    status: string;
	    err?: string;
	
	    static createFrom(source: any = {}) {
	        return new Progress(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.alias = source["alias"];
	        this.status = source["status"];
	        this.err = source["err"];
	    }
	}
	export class SessionTab {
	    alias: string;
	    local?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SessionTab(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.alias = source["alias"];
	        this.local = source["local"];
	    }
	}
	export class TreeCount {
	    files: number;
	    dirs: number;
	    bytes: number;
	
	    static createFrom(source: any = {}) {
	        return new TreeCount(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.files = source["files"];
	        this.dirs = source["dirs"];
	        this.bytes = source["bytes"];
	    }
	}
	export class Update {
	    current: string;
	    latest: string;
	    url: string;
	    newer: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Update(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.current = source["current"];
	        this.latest = source["latest"];
	        this.url = source["url"];
	        this.newer = source["newer"];
	    }
	}
	export class VaultStatus {
	    exists: boolean;
	    locked: boolean;
	
	    static createFrom(source: any = {}) {
	        return new VaultStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.exists = source["exists"];
	        this.locked = source["locked"];
	    }
	}

}

export namespace transfer {
	
	export class Endpoint {
	    src: string;
	    paths?: string[];
	    dir?: string;
	
	    static createFrom(source: any = {}) {
	        return new Endpoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.src = source["src"];
	        this.paths = source["paths"];
	        this.dir = source["dir"];
	    }
	}
	export class Item {
	    from: string;
	    to: string;
	    size: number;
	    status: string;
	    err?: string;
	
	    static createFrom(source: any = {}) {
	        return new Item(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.from = source["from"];
	        this.to = source["to"];
	        this.size = source["size"];
	        this.status = source["status"];
	        this.err = source["err"];
	    }
	}
	export class Job {
	    id: string;
	    from: Endpoint;
	    to: Endpoint;
	    move: boolean;
	    policy: string;
	    status: string;
	    items: Item[];
	    done: number;
	    bytes: number;
	    total: number;
	    current: string;
	    bps: number;
	    err?: string;
	
	    static createFrom(source: any = {}) {
	        return new Job(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.from = this.convertValues(source["from"], Endpoint);
	        this.to = this.convertValues(source["to"], Endpoint);
	        this.move = source["move"];
	        this.policy = source["policy"];
	        this.status = source["status"];
	        this.items = this.convertValues(source["items"], Item);
	        this.done = source["done"];
	        this.bytes = source["bytes"];
	        this.total = source["total"];
	        this.current = source["current"];
	        this.bps = source["bps"];
	        this.err = source["err"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

