"""Source-only return boundary compositions; audits never execute these models."""
from torch import nn


class ReturnAlternatives(nn.Module):
    def choose(self, x, report=False):
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

    def forward(self, x, report=False):
        return self.choose(x, report=report)


class PairedReturns(nn.Module):
    def choose(self, x, gate):
        a = x.sin()
        b = a.cos()
        c = b.tanh()
        d = c.relu()
        e = d.sin()
        f = e.cos()
        g = f.tanh()
        h = g.relu()
        if gate:
            return h, b
        else:
            return b, h

    def forward(self, x, gate):
        return self.choose(x, gate)


class UnknownReturns(nn.Module):
    def choose(self, x, gate):
        a = x.sin()
        b = a.cos()
        c = b.tanh()
        d = c.relu()
        e = d.sin()
        f = e.cos()
        g = f.tanh()
        h = g.relu()
        if gate:
            return foreign_result(h)
        return h

    def forward(self, x, gate):
        return self.choose(x, gate)


class StatefulReturns(nn.Module):
    def choose(self, x, gate):
        a = x.sin()
        b = a.cos()
        c = b.tanh()
        d = c.relu()
        e = d.sin()
        f = e.cos()
        g = f.tanh()
        h = g.relu()
        if gate:
            self.previous = h
            return h, b
        return h

    def forward(self, x, gate):
        return self.choose(x, gate)


class ComparedReturns(nn.Module):
    def choose(self, x, gate):
        a = x.sin()
        b = a.cos()
        c = b.tanh()
        d = c.relu()
        e = d.sin()
        f = e.cos()
        g = f.tanh()
        h = g.relu()
        if gate is not None:
            return h, b
        return h

    def forward(self, x, gate):
        return self.choose(x, gate)
