"""Physical source for per-use DAG notation and independent neighboring boundaries."""
import torch
from torch import nn


class ReusedRead(nn.Module):
    def __init__(self):
        super().__init__()
        self.register_buffer('offset', torch.ones(4))

    def forward(self, x):
        value = self.offset.to(x)
        return torch.tanh(x + value * value)


class SeparateReads(nn.Module):
    def __init__(self):
        super().__init__()
        self.register_buffer('offset', torch.ones(4))

    def forward(self, x):
        return torch.tanh(x + self.offset) + torch.cos(self.offset)


class ReadWithTuple(nn.Module):
    def __init__(self):
        super().__init__()
        self.register_buffer('offset', torch.ones(4))

    def forward(self, x):
        pair = (self.offset.to(x), x)
        return torch.tanh(pair[0] + pair[1])


class LongRead(nn.Module):
    def __init__(self):
        super().__init__()
        self.register_buffer('arbitrary_long_resource_description_without_architecture_family_information', torch.ones(4))

    def forward(self, x):
        value = self.arbitrary_long_resource_description_without_architecture_family_information.to(x)
        return torch.tanh(x + value * value)


class UnknownNeighbor(nn.Module):
    def __init__(self):
        super().__init__()
        self.prepare = ReusedRead()

    def forward(self, x):
        return foreign_operation(self.prepare(x))


class StatefulNeighbor(nn.Module):
    def __init__(self):
        super().__init__()
        self.prepare = ReusedRead()
        self.cell = nn.GRUCell(4, 4)

    def forward(self, x, previous):
        return self.cell(self.prepare(x), previous)


class ConditionalNeighbor(nn.Module):
    def __init__(self):
        super().__init__()
        self.prepare = ReusedRead()

    def forward(self, x, flag):
        value = self.prepare(x)
        if flag:
            return torch.relu(value)
        return value


class SharedNeighbor(nn.Module):
    def __init__(self):
        super().__init__()
        self.prepare = ReusedRead()

    def forward(self, x, y):
        return self.prepare(x) + self.prepare(y)


class ReusedWorkshop(nn.Module):
    def __init__(self):
        super().__init__()
        self.prepare = ReusedRead()

    def forward(self, x):
        return self.prepare(x)


class SeparateWorkshop(nn.Module):
    def __init__(self):
        super().__init__()
        self.prepare = SeparateReads()

    def forward(self, x):
        return self.prepare(x)


class TupleWorkshop(nn.Module):
    def __init__(self):
        super().__init__()
        self.prepare = ReadWithTuple()

    def forward(self, x):
        return self.prepare(x)


class LongWorkshop(nn.Module):
    def __init__(self):
        super().__init__()
        self.prepare = LongRead()

    def forward(self, x):
        return self.prepare(x)


class BoundaryChain(nn.Module):
    def __init__(self):
        super().__init__()
        self.prepare = ReusedRead()

    def forward(self, x, y):
        other = foreign_a(y)
        other = foreign_b(other)
        other = foreign_c(other)
        other = foreign_d(other)
        other = foreign_e(other)
        other = foreign_f(other)
        other = foreign_g(other)
        other = foreign_h(other)
        return self.prepare(x) + other


class WideLabel(nn.Module):
    def __init__(self):
        super().__init__()
        self.register_buffer('offset', torch.ones(4))

    def forward(self, x):
        value = x + self.offset
        return torch.nn.functional.adaptive_avg_pool2d(value, (1, 1))


class WideLabelWorkshop(nn.Module):
    def __init__(self):
        super().__init__()
        self.prepare = WideLabel()

    def forward(self, x):
        return self.prepare(x)
