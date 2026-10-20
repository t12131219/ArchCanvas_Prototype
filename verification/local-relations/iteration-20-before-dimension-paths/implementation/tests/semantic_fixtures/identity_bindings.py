"""Static identity examples; the analyzer must never import this file."""
import torch
from torch import nn


class AliasCalls(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Linear(8, 8)
        self.alias = self.first
        self.other = nn.Linear(8, 8)

    def forward(self, x, y):
        a = self.first(x)
        b = self.alias(y)
        c = self.other(x)
        return a + b + c


class Unit(nn.Module):
    def __init__(self):
        super().__init__()
        self.transform = nn.Linear(8, 8)

    def forward(self, x):
        return torch.sigmoid(self.transform(x))


class NestedAliasCalls(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = Unit()
        self.alias = self.first

    def forward(self, x, y):
        return self.first(x) + self.alias(y)


class ConditionalCalls(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Linear(8, 8)

    def forward(self, x, y, flag):
        if flag:
            a = self.first(x)
        else:
            a = self.first(y)
        return a


class InterruptedCalls(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Linear(8, 8)

    def forward(self, x, y):
        a = self.first(x)
        b = self.first(y)
        c = external(a)
        return b + self.first(c)


class ReboundAlias(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Linear(8, 8)
        self.alias = self.first

    def forward(self, x, y, replacement):
        a = self.first(x)
        self.first = replacement
        return a + self.alias(y) + self.first(x)


class EscapedOwner(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Linear(8, 8)
        external(self)

    def forward(self, x, y):
        return self.first(x) + self.first(y)


class TiedParameters(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Linear(8, 8)
        self.second = nn.Linear(8, 8)
        self.second.weight = self.first.weight

    def forward(self, x):
        return self.first(x) + self.second(x)


def invoke(operation, x):
    return operation(x)


class HelperCalls(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Linear(8, 8)

    def forward(self, x, y):
        return invoke(self.first, x) + invoke(self.first, y)
