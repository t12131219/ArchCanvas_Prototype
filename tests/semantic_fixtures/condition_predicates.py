"""Static conditional composition examples; never imported or executed by audits."""
from torch import nn


class ConditionalSplice(nn.Module):
    def forward(self, x, gate=None, other=None):
        a = x.sin()
        b = a.cos()
        c = b.tanh()
        d = c.relu()
        if gate is not None:
            d = d * gate
        e = d.sin()
        f = e.cos()
        if other is not None:
            f = f + other
        g = f.tanh()
        return g.relu()


class EscapingDecision(nn.Module):
    def forward(self, x, gate=None):
        a = x.sin()
        b = a.cos()
        c = b.tanh()
        d = c.relu()
        test = gate is not None
        if test:
            d = d * gate
        e = d.sin()
        f = e.cos()
        g = f.tanh()
        h = g.relu()
        return h, test


class UnknownDecision(nn.Module):
    def forward(self, x, gate=None):
        a = x.sin()
        b = a.cos()
        c = b.tanh()
        d = c.relu()
        if foreign_check(gate):
            d = d * gate
        e = d.sin()
        f = e.cos()
        g = f.tanh()
        return g.relu()
