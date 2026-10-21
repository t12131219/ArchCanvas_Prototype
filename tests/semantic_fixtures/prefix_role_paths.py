"""Source paths before certified roles, with unfamiliar and interrupted neighbors."""
from torch import nn


class PreparedCurve(nn.Module):
    def __init__(self):
        super().__init__()
        self.enter = nn.Linear(8, 12)
        self.curve = nn.GELU()
        self.separator = nn.Dropout(0.1)
        self.identity = nn.Identity()
        self.damp = nn.Dropout(0.2)
        self.leave = nn.Linear(12, 8)

    def prepare(self, x):
        return self.damp(self.identity(x))

    def forward(self, x):
        prepared = self.prepare(self.separator(self.curve(self.enter(x))))
        return self.leave(prepared)


class RenamedCurve(nn.Module):
    def __init__(self):
        super().__init__()
        self.a = nn.Linear(8, 12)
        self.b = nn.GELU()
        self.c = nn.Dropout(0.1)
        self.d = nn.Identity()
        self.e = nn.Dropout(0.2)
        self.f = nn.Linear(12, 8)

    def rearrange(self, signal):
        return self.e(self.d(signal))

    def forward(self, signal):
        first = self.rearrange(self.c(self.b(self.a(signal))))
        second = first
        return self.f(second)


class EscapingCurve(nn.Module):
    def __init__(self):
        super().__init__()
        self.enter = nn.Linear(8, 12)
        self.curve = nn.GELU()
        self.separator = nn.Dropout(0.1)
        self.identity = nn.Identity()
        self.damp = nn.Dropout(0.2)
        self.leave = nn.Linear(12, 8)

    def prepare(self, x):
        return self.damp(self.identity(x))

    def forward(self, x):
        prepared = self.prepare(self.separator(self.curve(self.enter(x))))
        return self.leave(prepared), prepared


class InterruptedCurve(nn.Module):
    def __init__(self):
        super().__init__()
        self.enter = nn.Linear(8, 12)
        self.curve = nn.GELU()
        self.separator = nn.Dropout(0.1)
        self.identity = nn.Identity()
        self.damp = nn.Dropout(0.2)
        self.leave = nn.Linear(12, 8)

    def prepare(self, x):
        return self.damp(unresolved_step(self.identity(x)))

    def forward(self, x):
        prepared = self.prepare(self.separator(self.curve(self.enter(x))))
        return self.leave(prepared)


class MixedPreparation(nn.Module):
    def __init__(self):
        super().__init__()
        self.known = PreparedCurve()
        self.interrupted = InterruptedCurve()
        self.recur = nn.GRU(8, 8, batch_first=True)

    def forward(self, x, context, hidden, flag):
        known = self.known(x)
        if flag:
            other = self.interrupted(context)
        else:
            other = context
        seq, state = self.recur(known + other, hidden)
        return seq, state
