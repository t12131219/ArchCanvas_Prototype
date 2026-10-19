"""Original sequence fixtures; tests parse these definitions without importing."""
import copy
import torch
from torch import nn


def assemble(unit, count):
    return nn.ModuleList([copy.deepcopy(unit) for _ in range(count)])


class Cell(nn.Module):
    def __init__(self, width=8):
        super().__init__()
        self.first = nn.Linear(width, width)
        self.last = nn.Linear(width, width)

    def forward(self, x):
        return x + self.last(torch.relu(self.first(x)))


class IndependentStack(nn.Module):
    def __init__(self, width=8, count=3):
        super().__init__()
        unit = Cell(width)
        self.units = assemble(unit, count)

    def forward(self, x):
        for block in self.units:
            x = block(x)
        return x


class SharedStack(nn.Module):
    def __init__(self, width=8, count=3):
        super().__init__()
        unit = Cell(width)
        self.units = nn.ModuleList([unit for _ in range(count)])

    def forward(self, x):
        for block in self.units:
            x = block(x)
        return x


class HeterogeneousStack(nn.Module):
    def __init__(self, width=8):
        super().__init__()
        self.units = nn.ModuleList([nn.Linear(width, width), nn.ReLU(), Cell(width)])

    def forward(self, x):
        for block in self.units:
            x = block(x)
        return x


class DynamicStack(nn.Module):
    def __init__(self, count):
        super().__init__()
        self.units = nn.ModuleList([Cell() for _ in range(count)])

    def forward(self, x):
        for block in self.units:
            x = block(x)
        return x


class InterruptedStack(nn.Module):
    def __init__(self):
        super().__init__()
        self.units = nn.ModuleList([Cell(), Cell()])

    def forward(self, x):
        for block in self.units:
            x = block(x)
            if x.sum() > 0:
                break
        return x


class MutatedStack(nn.Module):
    def __init__(self):
        super().__init__()
        self.units = nn.ModuleList([Cell(), Cell()])

    def forward(self, x):
        self.units.append(Cell())
        for block in self.units:
            x = block(x)
        return x


class ConditionalStack(nn.Module):
    def __init__(self, flag):
        super().__init__()
        if flag:
            self.units = nn.ModuleList([Cell(), Cell()])

    def forward(self, x):
        for block in self.units:
            x = block(x)
        return x


class ConvStack(nn.Module):
    def __init__(self, channels=4, count=2):
        super().__init__()
        self.units = nn.ModuleList([nn.Conv2d(channels, channels, 3, padding=1) for _ in range(count)])

    def forward(self, x):
        for block in self.units:
            x = block(x)
        return x


class IndexedConfiguration(nn.Module):
    def __init__(self, width=8, count=3):
        super().__init__()
        self.units = nn.ModuleList([nn.Linear(width + i, width + i + 1) for i in range(count)])

    def forward(self, x):
        for block in self.units:
            x = block(x)
        return x
