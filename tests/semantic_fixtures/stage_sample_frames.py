"""Unfamiliar repeats with local stages, reads and independent boundaries."""
import torch
from torch import nn


class SourceUnit(nn.Module):
    def __init__(self):
        super().__init__()
        self.drop = nn.Dropout(0.1)
        self.register_buffer('table', torch.ones(12, 4))

    def forward(self, x):
        part = self.table[:x.size(0)].to(dtype=x.dtype)
        return self.drop(x + part)


class Tile(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(4, 4)
        self.norm = nn.LayerNorm(4)

    def branch(self, x):
        return torch.tanh(self.project(x)).contiguous()

    def forward(self, x):
        return self.norm(x + self.branch(x))


class SignalStack(nn.Module):
    def __init__(self):
        super().__init__()
        self.prepare = SourceUnit()
        self.tiles = nn.ModuleList([Tile() for _ in range(3)])

    def forward(self, x, context):
        x = self.prepare(x)
        for tile in self.tiles:
            x = tile(x)
        return x * context


class TwinStacks(nn.Module):
    def __init__(self):
        super().__init__()
        self.prepare = SourceUnit()
        self.left = nn.ModuleList([Tile() for _ in range(3)])
        self.right = nn.ModuleList([Tile() for _ in range(3)])

    def first(self, x):
        for tile in self.left:
            x = tile(x)
        return x

    def second(self, x):
        for tile in self.right:
            x = tile(x)
        return x

    def forward(self, x, y):
        first = self.first(self.prepare(x))
        return first + self.second(y)


class ConditionalStack(nn.Module):
    def __init__(self):
        super().__init__()
        self.tiles = nn.ModuleList([Tile() for _ in range(3)])

    def forward(self, x, flag):
        for tile in self.tiles:
            x = tile(x)
        if flag:
            return torch.tanh(x)
        return torch.relu(x)


class UnknownStack(nn.Module):
    def __init__(self):
        super().__init__()
        self.tiles = nn.ModuleList([Tile() for _ in range(3)])

    def forward(self, x, context):
        for tile in self.tiles:
            x = tile(x)
        return foreign_operation(x, context)


class StateStack(nn.Module):
    def __init__(self):
        super().__init__()
        self.tiles = nn.ModuleList([Tile() for _ in range(3)])
        self.cell = nn.GRUCell(4, 4)

    def forward(self, x, previous):
        for tile in self.tiles:
            x = tile(x)
        return self.cell(x, previous)


class SharedStack(nn.Module):
    def __init__(self):
        super().__init__()
        self.tile = Tile()
        self.tiles = nn.ModuleList([self.tile, self.tile, self.tile])

    def forward(self, x):
        for tile in self.tiles:
            x = tile(x)
        return x


class MutatingTile(nn.Module):
    def forward(self, x):
        return x.add_(1)


class MixedStack(nn.Module):
    def __init__(self):
        super().__init__()
        self.tiles = nn.ModuleList([Tile(), MutatingTile(), Tile()])

    def forward(self, x):
        for tile in self.tiles:
            x = tile(x)
        return x
