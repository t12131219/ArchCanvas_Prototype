"""Unfamiliar fixed-input compositions; static extraction only."""
from torch import nn


class LateChoice(nn.Module):
    def weave(self, x, *, selected=False):
        a = x.sin()
        b = x.cos()
        c = x.tanh()
        y = a + b + c
        y = y.relu().sin().cos().tanh()
        if selected:
            return y, a
        return y

    def forward(self, x):
        return self.weave(x, selected=True)


class DynamicChoice(nn.Module):
    def weave(self, x, *, selected=False):
        a = x.sin()
        b = x.cos()
        c = x.tanh()
        y = a + b + c
        y = y.relu().sin().cos().tanh()
        if selected:
            return y, a
        return y

    def forward(self, x, flag=False):
        return self.weave(x, selected=flag)


class GuardedChoice(nn.Module):
    def weave(self, x, *, selected=False):
        a = x.sin()
        b = x.cos()
        c = x.tanh()
        y = a + b + c
        y = y.relu().sin().cos().tanh()
        if selected:
            return y, a
        return y

    def forward(self, x, flag):
        if flag:
            return self.weave(x, selected=True)
        return x


class MixedChoices(nn.Module):
    def weave(self, x, *, selected=False):
        a = x.sin()
        b = x.cos()
        c = x.tanh()
        y = a + b + c
        y = y.relu().sin().cos().tanh()
        if selected:
            return y, a
        return y

    def bridge(self, x, *, option=None):
        a = x.sin()
        b = x.cos()
        c = x.tanh()
        return unfamiliar_bridge(a + b + c, option)

    def forward(self, x):
        a = self.weave(x, selected=False)
        return self.bridge(a)
