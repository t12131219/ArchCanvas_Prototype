"""Unfamiliar role/helper compositions, shared uses and interrupted neighbors."""
from torch import nn


class PrismPath(nn.Module):
    def __init__(self):
        super().__init__()
        self.enter = nn.Linear(8, 12)
        self.curve = nn.GELU()
        self.damp = nn.Dropout(0.2)
        self.pass_through = nn.Identity()
        self.leave = nn.Linear(12, 8)

    def tail(self, x):
        return self.pass_through(self.damp(x))

    def forward(self, x):
        return self.leave(self.tail(self.curve(self.enter(x))))


class OtherNames(nn.Module):
    def __init__(self):
        super().__init__()
        self.a = nn.Linear(8, 12)
        self.b = nn.GELU()
        self.c = nn.Dropout(0.2)
        self.d = nn.Identity()
        self.e = nn.Linear(12, 8)

    def rearrange(self, signal):
        return self.d(self.c(signal))

    def forward(self, signal):
        return self.e(self.rearrange(self.b(self.a(signal))))


class SharedPath(nn.Module):
    def __init__(self):
        super().__init__()
        self.enter = nn.Linear(8, 12)
        self.curve = nn.GELU()
        self.damp = nn.Dropout(0.2)
        self.pass_through = nn.Identity()
        self.leave = nn.Linear(12, 8)

    def tail(self, x):
        return self.pass_through(self.damp(x))

    def forward(self, x):
        y = self.curve(self.enter(x))
        return self.leave(self.tail(y) + y)


class UnknownPath(nn.Module):
    def __init__(self):
        super().__init__()
        self.enter = nn.Linear(8, 12)
        self.curve = nn.GELU()
        self.damp = nn.Dropout(0.2)
        self.pass_through = nn.Identity()
        self.leave = nn.Linear(12, 8)

    def tail(self, x):
        return self.pass_through(unknown_adjustment(self.damp(x)))

    def forward(self, x):
        return self.leave(self.tail(self.curve(self.enter(x))))


class ConditionalPaths(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = PrismPath()
        self.second = OtherNames()

    def forward(self, x, other, flag):
        if flag:
            y = self.first(x)
        else:
            y = other
        return y + self.second(other)


class MixedPaths(nn.Module):
    def __init__(self):
        super().__init__()
        self.known = PrismPath()
        self.interrupted = UnknownPath()
        self.recur = nn.GRU(8, 8, batch_first=True)

    def forward(self, x, other, hidden):
        y = self.known(x)
        z = self.interrupted(other)
        seq, state = self.recur(y + z, hidden)
        return seq, state


class ParallelPaths(nn.Module):
    def __init__(self):
        super().__init__()
        self.left = PrismPath()
        self.right = OtherNames()

    def forward(self, x, context):
        return self.left(x) + self.right(context)


class InterleavedPaths(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = PrismPath()
        self.second = OtherNames()
        self.memory = nn.GRU(8, 8, batch_first=True)

    def forward(self, x, context, hidden, flag):
        a = self.first(x)
        if flag:
            b = unresolved_kernel(context)
        else:
            b = context
        seq, state = self.memory(a + b, hidden)
        return self.second(seq), state
