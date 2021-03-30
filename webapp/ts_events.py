
import threading

class ExitEvents:
    def __init__(self):
        self.exit_events_lock = threading.Lock()
        self.exit_events = {}

    def alloc(self, id):
        with self.exit_events_lock:
            self.exit_events[id] = threading.Event()

    def free(self, id):
        with self.exit_events_lock:
            if id in self.exit_events:
                del self.exit_events[id]

    def signal(self, id):
        with self.exit_events_lock:
            if id in self.exit_events:
                self.exit_events[id].set()

    def query(self, id):
        with self.exit_events_lock:
            if id in self.exit_events:
                return self.exit_events[id].is_set()