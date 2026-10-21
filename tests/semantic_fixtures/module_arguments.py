"""Passed module references are arguments, never implied invocations."""
from torch import nn


class SuppliedCurve(nn.Module):
    def __init__(self):
        super().__init__()
        self.adjust = nn.GELU()

    def weave(self, signal, transform):
        return transform(signal) + signal

    def forward(self, signal):
        return self.weave(signal, transform=self.adjust)


class UnusedCurve(nn.Module):
    def __init__(self):
        super().__init__()
        self.shape = nn.Linear(8, 8)

    def weave(self, signal, optional):
        return signal.relu()

    def forward(self, signal):
        return self.weave(signal, optional=self.shape)


class SharedCurve(nn.Module):
    def __init__(self):
        super().__init__()
        self.adjust = nn.GELU()

    def weave(self, signal, transform):
        return transform(signal) + signal

    def forward(self, signal):
        left = self.weave(signal, transform=self.adjust)
        right = self.weave(left, transform=self.adjust)
        return left + right


class GuardedCurve(nn.Module):
    def __init__(self):
        super().__init__()
        self.adjust = nn.GELU()

    def weave(self, signal, transform):
        return transform(signal) + signal

    def forward(self, signal, flag):
        if flag:
            return self.weave(signal, transform=self.adjust)
        return signal


class UnprovedCurve(nn.Module):
    def __init__(self):
        super().__init__()
        self.adjust = unknown_factory()

    def weave(self, signal, transform):
        return transform(signal) + signal

    def forward(self, signal):
        return self.weave(signal, transform=self.adjust)


class MixedSuppliers(nn.Module):
    def __init__(self):
        super().__init__()
        self.known = SuppliedCurve()
        self.shared = SharedCurve()
        self.unproved = UnprovedCurve()
        self.recur = nn.GRU(8, 8, batch_first=True)

    def forward(self, signal, context, hidden, flag):
        left = self.known(signal)
        right = self.shared(context)
        if flag:
            right = self.unproved(right)
        sequence, state = self.recur(left + right, hidden)
        return sequence, state
