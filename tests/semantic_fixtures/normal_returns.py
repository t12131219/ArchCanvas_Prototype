"""Unfamiliar source compositions with invocation-specific return boundaries."""
from torch import nn


class LocalChoice(nn.Module):
    def forward(self, x, report=False):
        a = x.sin()
        b = a.cos()
        c = b.tanh()
        d = c.relu()
        e = d.sin()
        f = e.cos()
        g = f.tanh()
        h = g.relu()
        if report:
            return h, b
        return h


class FixedReturn(nn.Module):
    def __init__(self):
        super().__init__()
        self.cell = LocalChoice()

    def forward(self, x):
        return self.cell(x, report=False)


class FixedTuple(nn.Module):
    def __init__(self):
        super().__init__()
        self.cell = LocalChoice()

    def forward(self, x):
        return self.cell(x, report=True)


class DefaultReturn(nn.Module):
    def __init__(self):
        super().__init__()
        self.cell = LocalChoice()

    def forward(self, x):
        return self.cell(x)


class DynamicReturn(nn.Module):
    def __init__(self):
        super().__init__()
        self.cell = LocalChoice()

    def forward(self, x, report=False):
        return self.cell(x, report=report)


class PairedChoice(nn.Module):
    def forward(self, x, swap=False):
        a = x.sin()
        b = a.cos()
        c = b.tanh()
        d = c.relu()
        e = d.sin()
        f = e.cos()
        g = f.tanh()
        h = g.relu()
        if swap:
            return h, b
        else:
            return b, h


class FixedPair(nn.Module):
    def __init__(self):
        super().__init__()
        self.cell = PairedChoice()

    def forward(self, x):
        return self.cell(x, swap=False)


class ReboundChoice(nn.Module):
    def forward(self, x, report=False):
        a = x.sin()
        b = a.cos()
        c = b.tanh()
        d = c.relu()
        e = d.sin()
        f = e.cos()
        g = f.tanh()
        h = g.relu()
        report = not report
        if report:
            return h, b
        return h


class ReboundReturn(nn.Module):
    def __init__(self):
        super().__init__()
        self.cell = ReboundChoice()

    def forward(self, x):
        return self.cell(x, report=False)


class UnknownChoice(nn.Module):
    def forward(self, x, report=False):
        a = x.sin()
        b = a.cos()
        c = b.tanh()
        d = c.relu()
        e = d.sin()
        f = e.cos()
        g = f.tanh()
        h = g.relu()
        if report:
            return foreign_result(h)
        return h


class UnknownReturn(nn.Module):
    def __init__(self):
        super().__init__()
        self.cell = UnknownChoice()

    def forward(self, x):
        return self.cell(x, report=False)


class StatefulChoice(nn.Module):
    def forward(self, x, report=False):
        a = x.sin()
        b = a.cos()
        c = b.tanh()
        d = c.relu()
        e = d.sin()
        f = e.cos()
        g = f.tanh()
        h = g.relu()
        if report:
            self.previous = h
            return h, b
        return h


class StatefulReturn(nn.Module):
    def __init__(self):
        super().__init__()
        self.cell = StatefulChoice()

    def forward(self, x):
        return self.cell(x, report=False)
