"""Source reorganization, escape and execution boundaries; never imported."""
from torch import nn


class InlineChain(nn.Module):
    def __init__(self):
        super().__init__()
        self.start = nn.Linear(8, 16)
        self.middle = nn.ReLU()
        self.finish = nn.Linear(16, 8)

    def forward(self, x):
        return self.finish(self.middle(self.start(x)))


class WrappedChain(nn.Module):
    def __init__(self):
        super().__init__()
        self.start = nn.Linear(8, 16)
        self.middle = nn.ReLU()
        self.finish = nn.Linear(16, 8)

    def bridge(self, x):
        return self.middle(x)

    def forward(self, x):
        return self.finish(self.bridge(self.start(x)))


class SplitChain(nn.Module):
    def __init__(self):
        super().__init__()
        self.start = nn.Linear(8, 16)
        self.middle = nn.ReLU()
        self.finish = nn.Linear(16, 8)

    def enter(self, x):
        return self.start(x)

    def bridge(self, x):
        return self.middle(x)

    def leave(self, x):
        return self.finish(x)

    def forward(self, x):
        return self.leave(self.bridge(self.enter(x)))


class NestedChain(nn.Module):
    def __init__(self):
        super().__init__()
        self.start = nn.Linear(8, 16)
        self.middle = nn.ReLU()
        self.finish = nn.Linear(16, 8)

    def bridge(self, x):
        return self.middle(x)

    def core(self, x):
        return self.finish(self.bridge(self.start(x)))

    def forward(self, x):
        return self.core(x)


class UnknownChain(nn.Module):
    def __init__(self):
        super().__init__()
        self.start = nn.Linear(8, 16)
        self.middle = nn.ReLU()
        self.finish = nn.Linear(16, 8)

    def bridge(self, x):
        return foreign_kernel(x)

    def forward(self, x):
        return self.finish(self.bridge(self.start(x)))


class ConditionalChain(nn.Module):
    def __init__(self):
        super().__init__()
        self.start = nn.Linear(8, 16)
        self.middle = nn.ReLU()
        self.finish = nn.Linear(16, 8)

    def bridge(self, x):
        if x.sum() > 0:
            return self.middle(x)
        return x

    def forward(self, x):
        return self.finish(self.bridge(self.start(x)))


class MutableChain(nn.Module):
    def __init__(self):
        super().__init__()
        self.start = nn.Linear(8, 16)
        self.middle = nn.ReLU()
        self.finish = nn.Linear(16, 8)

    def bridge(self, x):
        x += 1
        return self.middle(x)

    def forward(self, x):
        return self.finish(self.bridge(self.start(x)))


class EscapingChain(nn.Module):
    def __init__(self):
        super().__init__()
        self.start = nn.Linear(8, 16)
        self.middle = nn.ReLU()
        self.finish = nn.Linear(16, 8)

    def forward(self, x):
        h = self.middle(self.start(x))
        return self.finish(h), h


class DisconnectedChain(nn.Module):
    def __init__(self):
        super().__init__()
        self.start = nn.Linear(8, 16)
        self.middle = nn.ReLU()
        self.finish = nn.Linear(16, 8)

    def forward(self, x, other):
        ignored = self.middle(other)
        return self.finish(self.middle(self.start(x)))


class SharedChain(nn.Module):
    def __init__(self):
        super().__init__()
        self.shared = nn.Linear(8, 8)
        self.middle = nn.ReLU()

    def bridge(self, x):
        return self.middle(x)

    def forward(self, x):
        return self.shared(self.bridge(self.shared(x)))
