#
# TowerScout
# A tool for identifying cooling towers from satellite and aerial imagery
#
# TowerScout Team:
# Karen Wong, Gunnar Mein, Thaddeus Segura, Jia Lu
#
# Licensed under CC-BY-NC-SA-4.0
# (see LICENSE.TXT in the root of the repository for details)
#

# events class: An alert mechanism we need to abort server jobs

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