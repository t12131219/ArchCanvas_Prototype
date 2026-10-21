"""Unfamiliar paired scopes with residual wrappers and protected neighbors."""
from torch import nn


class SignalPath(nn.Module):
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


class PairedEnvelope(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = SignalPath()
        self.second = SignalPath()
        self.drop = nn.Dropout(0.1)
        self.norm_a = nn.LayerNorm(8)
        self.norm_b = nn.LayerNorm(8)

    def forward(self, x, context):
        y = self.norm_a(x + self.drop(self.first(x)))
        return self.norm_b(y + self.drop(self.second(context)))


class SplitEnvelopes(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = PairedEnvelope()
        self.second = PairedEnvelope()

    def forward(self, x, context):
        return self.second(self.first(x, context), context)


class FramedEnvelope(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = SignalPath()
        self.second = SignalPath()
        self.drop = nn.Dropout(0.1)
        self.norm_a = nn.LayerNorm(8)
        self.norm_b = nn.LayerNorm(8)
        self.lead = nn.Identity()
        self.bridge = nn.Identity()
        self.finish = nn.Identity()

    def forward(self, x, context):
        x = self.lead(x)
        y = self.norm_a(x + self.drop(self.first(x)))
        y = self.bridge(y)
        result = self.norm_b(y + self.drop(self.second(context)))
        return self.finish(result)


class GuardedEnvelope(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = SignalPath()
        self.second = SignalPath()
        self.memory = nn.GRU(8, 8, batch_first=True)

    def forward(self, x, context, hidden, flag):
        a = self.first(x)
        if flag:
            b = unresolved_kernel(context)
        else:
            b = context
        seq, state = self.memory(a + b, hidden)
        return self.second(seq), state


class SharedEnvelope(nn.Module):
    def __init__(self):
        super().__init__()
        self.shared = SignalPath()

    def forward(self, x, context):
        return self.shared(x) + self.shared(context)
