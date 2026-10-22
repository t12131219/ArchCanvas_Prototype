"""Unfamiliar source calls: names identify source, never model semantics."""
import torch
from torch import nn


class Adjust(nn.Module):
    def __init__(self):
        super().__init__()
        self.register_buffer('offset', torch.ones(4))

    def forward(self, x):
        v = self.offset.to(x)
        return torch.sin(x + v * v)


class UnnamedWork(nn.Module):
    def __init__(self):
        super().__init__()
        self.adjust = Adjust()

    def forward(self, x):
        return self.adjust(x)


class LongAlias(nn.Module):
    def __init__(self):
        super().__init__()
        self.a_source_call_with_an_extremely_long_name_that_must_not_expand_the_coarse_diagram = Adjust()

    def forward(self, x):
        return self.a_source_call_with_an_extremely_long_name_that_must_not_expand_the_coarse_diagram(x)


class UnknownBoundary(nn.Module):
    def __init__(self):
        super().__init__()
        self.adjust = Adjust()

    def forward(self, x):
        return foreign_transform(self.adjust(x))


class ConditionalBoundary(nn.Module):
    def __init__(self):
        super().__init__()
        self.adjust = Adjust()

    def forward(self, x, flag):
        v = self.adjust(x)
        if flag:
            return torch.cos(v)
        return v


class StateBoundary(nn.Module):
    def __init__(self):
        super().__init__()
        self.adjust = Adjust()
        self.cell = nn.GRUCell(4, 4)

    def forward(self, x, previous):
        return self.cell(self.adjust(x), previous)


class SharedBoundary(nn.Module):
    def __init__(self):
        super().__init__()
        self.adjust = Adjust()

    def forward(self, x, y):
        return self.adjust(x) + self.adjust(y)


class MutableBoundary(nn.Module):
    def __init__(self):
        super().__init__()
        self.adjust = Adjust()

    def forward(self, x):
        v = self.adjust(x)
        return v.add_(x)


class UnknownInside(nn.Module):
    def forward(self, x):
        return torch.sin(foreign_transform(x))


class ProtectedInside(nn.Module):
    def __init__(self):
        super().__init__()
        self.adjust = UnknownInside()

    def forward(self, x):
        return self.adjust(x)
