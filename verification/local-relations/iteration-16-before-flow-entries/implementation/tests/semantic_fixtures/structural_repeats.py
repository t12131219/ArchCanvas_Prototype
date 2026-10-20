"""Source-only development inputs for class-independent local correspondence."""
import torch
from torch import nn


class First(nn.Module):
    def __init__(self, unused=0):
        super().__init__()
        self.a = nn.Linear(8, 8)

    def forward(self, x):
        return x + torch.relu(self.a(x))


class OtherSpelling(nn.Module):
    def __init__(self):
        super().__init__()
        self.delta = nn.Linear(8, 8)

    def apply_piece(self, signal):
        return torch.relu(self.delta(signal))

    def forward(self, value):
        return value + self.apply_piece(value)


class PlusOne(nn.Module):
    def __init__(self):
        super().__init__()

    def forward(self, x):
        return x + 1


class PlusTwo(nn.Module):
    def __init__(self):
        super().__init__()

    def forward(self, x):
        return x + 2


class Uncertain(nn.Module):
    def __init__(self):
        super().__init__()

    def forward(self, x):
        return unknown_call(x)


class Conditioned(nn.Module):
    def __init__(self):
        super().__init__()

    def forward(self, x):
        if x.sum() > 0:
            value = x + 1
        else:
            value = x - 1
        return value


class EquivalentSteps(nn.Module):
    def __init__(self):
        super().__init__()
        self.parts = nn.ModuleList([First(0), OtherSpelling(), First(9)])

    def forward(self, x):
        for part in self.parts:
            x = part(x)
        return x


class MixedSteps(nn.Module):
    def __init__(self):
        super().__init__()
        self.parts = nn.ModuleList([First(), OtherSpelling(), PlusTwo(), First()])

    def forward(self, x):
        for part in self.parts:
            x = part(x)
        return x


class LiteralSteps(nn.Module):
    def __init__(self):
        super().__init__()
        self.parts = nn.ModuleList([PlusOne(), PlusTwo()])

    def forward(self, x):
        for part in self.parts:
            x = part(x)
        return x


class UnknownSteps(nn.Module):
    def __init__(self):
        super().__init__()
        self.parts = nn.ModuleList([Uncertain(), Uncertain(), PlusOne()])

    def forward(self, x):
        for part in self.parts:
            x = part(x)
        return x


class ConditionalSteps(nn.Module):
    def __init__(self):
        super().__init__()
        self.parts = nn.ModuleList([Conditioned(), Conditioned()])

    def forward(self, x):
        for part in self.parts:
            x = part(x)
        return x


class SharedInside(nn.Module):
    def __init__(self):
        super().__init__()
        self.a = nn.Linear(8, 8)

    def forward(self, x):
        return self.a(x) + self.a(x)


class IndependentInside(nn.Module):
    def __init__(self):
        super().__init__()
        self.a = nn.Linear(8, 8)
        self.b = nn.Linear(8, 8)

    def forward(self, x):
        return self.a(x) + self.b(x)


class AliasPartitionSteps(nn.Module):
    def __init__(self):
        super().__init__()
        self.parts = nn.ModuleList([SharedInside(), IndependentInside()])

    def forward(self, x):
        for part in self.parts:
            x = part(x)
        return x


class MutableInside(nn.Module):
    def __init__(self):
        super().__init__()
        self.a = nn.ReLU(inplace=True)

    def forward(self, x):
        return self.a(x)


class MutableSteps(nn.Module):
    def __init__(self):
        super().__init__()
        self.parts = nn.ModuleList([MutableInside(), MutableInside()])

    def forward(self, x):
        for part in self.parts:
            x = part(x)
        return x
